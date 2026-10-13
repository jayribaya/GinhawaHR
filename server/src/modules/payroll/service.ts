import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import * as m from "../../infrastructure/models.js";
import { requirePermission, type Principal } from "../roles/policy.js";
import { AppError, deny } from "../../common/errors.js";
import {
  calculate,
  cents,
  ratio,
  assertTransition,
  type Rule,
  type PayInput,
} from "./domain.js";
import { audit } from "../../infrastructure/audit.js";
export class PayrollService {
  async create(
    actor: Principal,
    periodId: string,
    key: string,
    correlationId: string,
  ) {
    requirePermission(actor, "payroll.prepare");
    if (actor.scope !== "company") throw deny();
    const period = await m.PayrollPeriod.findOne({
      _id: periodId,
      companyId: actor.companyId,
      status: "Open",
    });
    if (!period)
      throw new AppError(404, "NOT_FOUND", "Open payroll period not found");
    const prior = await m.PayrollRun.findOne({
      companyId: actor.companyId,
      idempotencyKey: key,
    });
    if (prior) {
      if (String(prior.periodId) !== periodId)
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Key was used for another period",
        );
      return prior;
    }
    return mongoose.connection.transaction(async (session) => {
      const [run] = await m.PayrollRun.create(
        [
          {
            companyId: actor.companyId,
            periodId,
            preparedBy: actor.userId,
            runNumber: "GH-" + randomUUID(),
            idempotencyKey: key,
          },
        ],
        { session },
      );
      await audit(
        actor,
        "payroll.create",
        run!.id,
        correlationId,
        undefined,
        session,
      );
      return run;
    });
  }
  async compute(
    actor: Principal,
    runId: string,
    revision: number,
    correlationId: string,
  ) {
    requirePermission(actor, "payroll.prepare");
    if (actor.scope !== "company") throw deny();
    return mongoose.connection.transaction(async (session) => {
      const run = await m.PayrollRun.findOne({
        _id: runId,
        companyId: actor.companyId,
        revision,
      }).session(session);
      if (!run)
        throw new AppError(
          409,
          "CONFLICT",
          "Payroll changed. Reload before continuing.",
        );
      if (!["Draft", "Rejected"].includes(run.status))
        throw new AppError(
          409,
          "IMMUTABLE",
          "Only draft or rejected runs can be calculated",
        );
      const period = await m.PayrollPeriod.findById(run.periodId).session(
        session,
      );
      if (!period)
        throw new AppError(422, "MISSING_PERIOD", "Payroll period missing");
      const policies = await m.StatutoryRuleVersion.find({
        companyId: actor.companyId,
        effectiveFrom: { $lte: period.endDate },
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: { $gte: period.startDate } },
        ],
      })
        .sort({ effectiveFrom: -1 })
        .session(session);
      const rules: Rule[] = [];
      for (const p of policies)
        if (!rules.some((r) => r.kind === p.kind))
          rules.push({
            ...p.policy,
            kind: p.kind,
            version: p.version,
            verified: p.verified,
            source: p.source,
            effectiveFrom: p.effectiveFrom,
            ...(p.effectiveTo ? { effectiveTo: p.effectiveTo } : {}),
          } as Rule);
      const employees = await m.Employee.find({
        companyId: actor.companyId,
        hireDate: { $lte: new Date(period.endDate + "T15:59:59Z") },
        status: { $in: ["Active", "On Leave", "Suspended", "Separated"] },
        $or: [
          { separationDate: { $exists: false } },
          {
            separationDate: {
              $gte: new Date(period.startDate + "T00:00:00+08:00"),
            },
          },
        ],
      }).session(session);
      if (!employees.length)
        throw new AppError(422, "NO_EMPLOYEES", "No eligible employees");
      await m.PayrollItem.deleteMany({ runId }).session(session);
      let gross = 0n,
        net = 0n;
      const exceptions = new Set<string>([
        "STATUTORY_ENGINE_REQUIRES_PROFESSIONAL_VALIDATION",
      ]);
      for (const employee of employees) {
        const salary = await m.SalaryHistory.findOne({
          companyId: actor.companyId,
          employeeId: employee.id,
          effectiveDate: { $lte: new Date(period.endDate + "T15:59:59Z") },
        })
          .sort({ effectiveDate: -1 })
          .session(session);
        if (!salary) {
          exceptions.add("MISSING_SALARY:" + employee.employeeNumber);
          continue;
        }
        const attendance = await m.AttendanceRecord.find({
          companyId: actor.companyId,
          employeeId: employee.id,
          day: { $gte: period.startDate, $lte: period.endDate },
        }).session(session);
        const leave = await m.LeaveRequest.find({
          companyId: actor.companyId,
          employeeId: employee.id,
          status: "Approved",
          startDate: { $lte: period.endDate },
          endDate: { $gte: period.startDate },
        })
          .populate("leaveTypeId")
          .session(session);
        const overtime = await m.OvertimeRequest.find({
          companyId: actor.companyId,
          employeeId: employee.id,
          status: "Approved",
          day: { $gte: period.startDate, $lte: period.endDate },
        }).session(session);
        const loans = await m.Loan.find({
          companyId: actor.companyId,
          employeeId: employee.id,
          status: "Active",
          effectiveFrom: { $lte: new Date(period.endDate) },
        }).session(session);
        const adjustments = await m.PayrollAdjustment.find({
          companyId: actor.companyId,
          employeeId: employee.id,
          originalRunId: runId,
        }).session(session);
        const earningItems = adjustments
          .filter((a) => cents(a.amount) >= 0n)
          .map((a) => ({
            name: a.reason,
            amount: a.amount,
            taxable: true,
            contributionRelevant: true,
          }));
        const deductionItems = [
          ...loans.map((l) => ({
            name: "Loan: " + l.name,
            amount: (cents(l.balance) < cents(l.installment)
              ? cents(l.balance)
              : cents(l.installment)
            ).toString(),
            loanId: l.id,
          })),
          ...adjustments
            .filter((a) => cents(a.amount) < 0n)
            .map((a) => ({
              name: a.reason,
              amount: (-cents(a.amount)).toString(),
            })),
        ];
        let base = salary.amount;
        if (salary.basis === "monthly" || salary.basis === "semi-monthly")
          base = ratio(
            cents(salary.amount),
            1n,
            BigInt(period.salaryDivisor),
          ).toString();
        else if (salary.basis === "daily")
          base = (
            cents(salary.amount) *
            BigInt(attendance.filter((a) => a.clockOut).length)
          ).toString();
        else
          base = ratio(
            cents(salary.amount),
            BigInt(attendance.reduce((s, a) => s + a.workedMinutes, 0)),
            60n,
          ).toString();
        const input: PayInput = {
          base,
          paidUnits: period.periodUnits,
          periodUnits: period.periodUnits,
          earnings: earningItems,
          deductions: deductionItems,
        };
        const result = calculate(input, rules);
        if (
          leave.length ||
          overtime.length ||
          attendance.some((a) => !a.clockOut)
        )
          result.exceptions.push("TIMEKEEPING_POLICY_REVIEW_REQUIRED");
        if (
          salary.effectiveDate > new Date(period.startDate) ||
          employee.hireDate > new Date(period.startDate) ||
          employee.separationDate
        )
          result.exceptions.push(
            "PARTIAL_PERIOD_OR_SALARY_CHANGE_REQUIRES_REVIEW",
          );
        for (const e of result.exceptions) exceptions.add(e);
        await m.PayrollItem.create(
          [
            {
              companyId: actor.companyId,
              employeeId: employee.id,
              departmentId: employee.departmentId,
              runId,
              snapshot: {
                employee: {
                  employeeNumber: employee.employeeNumber,
                  firstName: employee.firstName,
                  lastName: employee.lastName,
                  departmentId: employee.departmentId,
                },
                salary: salary.toObject(),
                input,
                attendance: attendance.map((a) => a.toObject()),
                leave: leave.map((l) => l.toObject()),
                overtime: overtime.map((o) => o.toObject()),
                loans: loans.map((l) => l.toObject()),
                adjustments: adjustments.map((a) => a.toObject()),
              },
              result,
            },
          ],
          { session },
        );
        gross += cents(result.gross);
        net += cents(result.net);
      }
      run.status = "Calculated";
      run.gross = gross.toString();
      run.net = net.toString();
      run.exceptions = [...exceptions];
      run.policySnapshot = rules;
      run.periodSnapshot = period.toObject();
      run.revision++;
      await run.save({ session });
      await audit(
        actor,
        "payroll.calculate",
        run.id,
        correlationId,
        undefined,
        session,
      );
      return run;
    });
  }
  async transition(
    actor: Principal,
    runId: string,
    to: "Under Review" | "Approved" | "Rejected" | "Finalized",
    revision: number,
    reason: string,
    correlationId: string,
  ) {
    requirePermission(
      actor,
      to === "Finalized"
        ? "payroll.finalize"
        : ["Approved", "Rejected"].includes(to)
          ? "payroll.approve"
          : "payroll.prepare",
    );
    if (actor.scope !== "company") throw deny();
    return mongoose.connection.transaction(async (session) => {
      const run = await m.PayrollRun.findOne({
        _id: runId,
        companyId: actor.companyId,
        revision,
      }).session(session);
      if (!run)
        throw new AppError(
          409,
          "CONFLICT",
          "Payroll changed. Reload before continuing.",
        );
      assertTransition(run.status, to);
      if (
        ["Approved", "Rejected", "Finalized"].includes(to) &&
        String(run.preparedBy) === actor.userId
      )
        throw new AppError(
          403,
          "SEPARATION_OF_DUTIES",
          "The preparer cannot approve or finalize this run",
        );
      if (to === "Finalized") {
        if (run.exceptions.length)
          throw new AppError(
            422,
            "FINALIZATION_BLOCKED",
            "Resolve all payroll exceptions before finalization",
          );
        if (!run.approvedBy)
          throw new AppError(422, "MISSING_APPROVAL", "Approval is required");
        const items = await m.PayrollItem.find({ runId }).session(session);
        if (!items.length)
          throw new AppError(422, "EMPTY_PAYROLL", "No payroll items");
        let gross = 0n,
          net = 0n;
        for (const item of items) {
          gross += cents(item.result.gross);
          net += cents(item.result.net);
          await m.Payslip.create(
            [
              {
                companyId: actor.companyId,
                employeeId: item.employeeId,
                departmentId: item.departmentId,
                runId,
                itemId: item.id,
              },
            ],
            { session },
          );
          await m.AttendanceRecord.updateMany(
            {
              _id: {
                $in: item.snapshot.attendance.map(
                  (a: { _id: string }) => a._id,
                ),
              },
              lockedRunId: { $exists: false },
            },
            { $set: { lockedRunId: runId } },
            { session },
          );
          for (const loan of item.snapshot.loans as {
            _id: string;
            balance: string;
            installment: string;
          }[]) {
            const amount =
              cents(loan.balance) < cents(loan.installment)
                ? cents(loan.balance)
                : cents(loan.installment);
            const current = await m.Loan.findOne({
              _id: loan._id,
              balance: loan.balance,
            }).session(session);
            if (!current)
              throw new AppError(
                409,
                "LOAN_CHANGED",
                "Recalculate changed loan inputs",
              );
            current.balance = (cents(current.balance) - amount).toString();
            if (current.balance === "0") current.status = "Completed";
            await current.save({ session });
            await m.Repayment.create(
              [
                {
                  companyId: actor.companyId,
                  employeeId: item.employeeId,
                  departmentId: item.departmentId,
                  loanId: loan._id,
                  runId,
                  amount: amount.toString(),
                },
              ],
              { session },
            );
          }
        }
        if (gross !== cents(run.gross) || net !== cents(run.net))
          throw new AppError(
            422,
            "TOTAL_MISMATCH",
            "Payroll totals do not reconcile",
          );
        await m.PayrollPeriod.updateOne(
          { _id: run.periodId },
          { $set: { status: "Locked" } },
          { session },
        );
        run.finalizedAt = new Date();
        run.finalizedBy = new mongoose.Types.ObjectId(actor.userId);
      }
      if (to === "Approved")
        run.approvedBy = new mongoose.Types.ObjectId(actor.userId);
      run.status = to;
      run.reason = reason;
      run.revision++;
      await run.save({ session });
      await audit(
        actor,
        "payroll." + to,
        run.id,
        correlationId,
        reason,
        session,
      );
      return run;
    });
  }
}

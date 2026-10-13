import { Router } from "express";
import { z } from "zod";
import { Loan, Repayment } from "../../infrastructure/models.js";
import { handler, ok } from "../../common/http.js";
import { requirePermission } from "../roles/policy.js";
import { findEmployee } from "../employees/repository.js";
import { scopedEmployeeIds } from "../attendance/routes.js";
import { id, date, money } from "../employees/validators.js";
import { audit } from "../../infrastructure/audit.js";
import { cents } from "../payroll/domain.js";
import { AppError, deny } from "../../common/errors.js";
export function loanRoutes() {
  const router = Router();
  router.get(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, "loans.read");
      ok(
        res,
        await Loan.find({
          companyId: req.actor.companyId,
          employeeId: { $in: await scopedEmployeeIds(req.actor) },
        })
          .populate("employeeId", "firstName lastName")
          .sort({ createdAt: -1 })
          .limit(100),
      );
    }),
  );
  router.post(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, "loans.write");
      if (req.actor.scope !== "company") throw deny();
      const data = z
        .object({
          employeeId: id,
          name: z.string().min(1),
          principal: money,
          installment: money,
          effectiveFrom: date,
          reason: z.string().min(3),
        })
        .strict()
        .parse(req.body);
      if (
        cents(data.installment) <= 0n ||
        cents(data.principal) <= 0n ||
        cents(data.installment) > cents(data.principal)
      )
        throw new AppError(
          422,
          "INVALID_LOAN",
          "Invalid principal or installment",
        );
      const employee = await findEmployee(req.actor, data.employeeId);
      const loan = await Loan.create({
        ...data,
        balance: data.principal,
        companyId: req.actor.companyId,
        departmentId: employee.departmentId,
      });
      await audit(
        req.actor,
        "loan.create",
        loan.id,
        req.correlationId,
        data.reason,
      );
      ok(res.status(201), loan);
    }),
  );
  router.get(
    "/:id/repayments",
    handler(async (req, res) => {
      requirePermission(req.actor, "loans.read");
      const loan = await Loan.findOne({
        _id: id.parse(req.params.id),
        companyId: req.actor.companyId,
      });
      if (!loan) throw new AppError(404, "NOT_FOUND", "Record not found");
      await findEmployee(req.actor, String(loan.employeeId));
      ok(
        res,
        await Repayment.find({
          loanId: loan.id,
          companyId: req.actor.companyId,
        }),
      );
    }),
  );
  return router;
}

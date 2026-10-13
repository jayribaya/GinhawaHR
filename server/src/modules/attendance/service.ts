import mongoose from "mongoose";
import {
  AttendanceRecord,
  AttendanceAdjustment,
  Employee,
} from "../../infrastructure/models.js";
import { findEmployee } from "../employees/repository.js";
import { type Principal, requirePermission } from "../roles/policy.js";
import { AppError, deny } from "../../common/errors.js";
import { audit } from "../../infrastructure/audit.js";
import type { PeriodLockPolicy } from "../../common/ports.js";
import { parse } from "csv-parse/sync";
import { z } from "zod";
export const manilaDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
export class AttendanceService {
  constructor(private periods: PeriodLockPolicy) {}
  assertWritable(
    companyId: string,
    from: string,
    to: string,
    session?: mongoose.ClientSession,
  ) {
    return this.periods.assertWritable(companyId, from, to, session);
  }
  async importCsv(
    actor: Principal,
    csv: string,
    reason: string,
    correlationId: string,
  ) {
    requirePermission(actor, "attendance.write");
    if (actor.scope !== "company") throw deny();
    let parsed: unknown;
    try {
      parsed = parse(csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new AppError(
        422,
        "INVALID_CSV",
        "CSV must have employeeNumber,clockIn,clockOut headers and valid quoted rows",
      );
    }
    const rows = z
      .array(
        z
          .object({
            employeeNumber: z.string().min(1).max(40),
            clockIn: z.iso.datetime({ offset: true }),
            clockOut: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(1000)
      .parse(parsed);
    return mongoose.connection.transaction(async (session) => {
      for (const row of rows) {
        const employee = await Employee.findOne({
          employeeNumber: row.employeeNumber,
          companyId: actor.companyId,
        }).session(session);
        if (!employee)
          throw new AppError(
            422,
            "UNKNOWN_EMPLOYEE",
            "An import row references an unknown employee",
          );
        const clockIn = new Date(row.clockIn),
          clockOut = new Date(row.clockOut);
        if (
          clockOut <= clockIn ||
          clockOut.getTime() - clockIn.getTime() > 48 * 3600000
        )
          throw new AppError(
            422,
            "INVALID_TIME",
            "Import shifts must be positive and no longer than 48 hours",
          );
        const day = manilaDay(clockIn);
        await this.assertWritable(actor.companyId, day, day, session);
        await AttendanceRecord.create(
          [
            {
              companyId: actor.companyId,
              employeeId: employee.id,
              departmentId: employee.departmentId,
              day,
              clockIn,
              clockOut,
              workedMinutes: Math.floor(
                (clockOut.getTime() - clockIn.getTime()) / 60000,
              ),
              source: "csv",
            },
          ],
          { session },
        );
      }
      await audit(
        actor,
        "attendance.import",
        actor.companyId,
        correlationId,
        reason,
        session,
      );
      return rows.length;
    });
  }
  async clock(actor: Principal, action: "in" | "out", correlationId: string) {
    requirePermission(actor, "attendance.write");
    if (!actor.employeeId)
      throw new AppError(
        422,
        "NO_EMPLOYEE",
        "Your account is not linked to an employee",
      );
    const employee = await findEmployee(actor, actor.employeeId);
    if (employee.status !== "Active") throw deny();
    const now = new Date();
    return mongoose.connection.transaction(async (session) => {
      let record;
      if (action === "in") {
        await this.periods.assertWritable(
          actor.companyId,
          manilaDay(now),
          manilaDay(now),
          session,
        );
        if (
          await AttendanceRecord.exists({
            employeeId: employee.id,
            clockOut: { $exists: false },
          }).session(session)
        )
          throw new AppError(
            409,
            "OPEN_SHIFT",
            "Clock out of the current shift first",
          );
        record = new AttendanceRecord({
          companyId: actor.companyId,
          employeeId: employee.id,
          departmentId: employee.departmentId,
          day: manilaDay(now),
          clockIn: now,
        });
        await record.save({ session });
      } else {
        record = await AttendanceRecord.findOne({
          companyId: actor.companyId,
          employeeId: employee.id,
          clockOut: { $exists: false },
          lockedRunId: { $exists: false },
        }).session(session);
        if (!record)
          throw new AppError(409, "NO_OPEN_SHIFT", "No unlocked open shift");
        record.clockOut = now;
        record.workedMinutes = Math.floor(
          (now.getTime() - record.clockIn.getTime()) / 60000,
        );
        await this.periods.assertWritable(
          actor.companyId,
          record.day,
          record.day,
          session,
        );
        await record.save({ session });
      }
      await audit(
        actor,
        "attendance.clock." + action,
        record.id,
        correlationId,
        undefined,
        session,
      );
      return record;
    });
  }
  async approve(
    actor: Principal,
    adjustmentId: string,
    decision: "Approved" | "Rejected",
    correlationId: string,
  ) {
    requirePermission(actor, "attendance.approve");
    return mongoose.connection.transaction(async (session) => {
      const adjustment = await AttendanceAdjustment.findOne({
        _id: adjustmentId,
        companyId: actor.companyId,
        status: "Pending",
      }).session(session);
      if (!adjustment)
        throw new AppError(404, "NOT_FOUND", "Pending adjustment not found");
      await findEmployee(actor, String(adjustment.employeeId), session);
      if (String(adjustment.requestedBy) === actor.userId) throw deny();
      const record = await AttendanceRecord.findOne({
        _id: adjustment.attendanceId,
        companyId: actor.companyId,
      }).session(session);
      if (!record || record.lockedRunId)
        throw new AppError(
          409,
          "LOCKED",
          "Finalized attendance requires a payroll correction",
        );
      await this.periods.assertWritable(
        actor.companyId,
        record.day,
        record.day,
        session,
      );
      adjustment.status = decision;
      adjustment.approvedBy = new mongoose.Types.ObjectId(actor.userId);
      await adjustment.save({ session });
      if (decision === "Approved") {
        record.clockIn = adjustment.clockIn;
        record.clockOut = adjustment.clockOut;
        record.workedMinutes = Math.floor(
          (adjustment.clockOut.getTime() - adjustment.clockIn.getTime()) /
            60000,
        );
        record.source = "adjustment";
        await record.save({ session });
      }
      await audit(
        actor,
        "attendance.adjustment." + decision,
        adjustment.id,
        correlationId,
        adjustment.reason,
        session,
      );
      return adjustment;
    });
  }
}

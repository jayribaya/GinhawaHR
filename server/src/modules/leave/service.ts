import mongoose from "mongoose";
import {
  LeaveRequest,
  LeaveType,
  LeaveBalance,
  LeaveTransaction,
  OvertimeRequest,
} from "../../infrastructure/models.js";
import type { PeriodLockPolicy } from "../../common/ports.js";
import { findEmployee } from "../employees/repository.js";
import { requirePermission, type Principal } from "../roles/policy.js";
import { AppError, deny } from "../../common/errors.js";
import { audit, notify } from "../../infrastructure/audit.js";
export class LeaveService {
  constructor(private periods: PeriodLockPolicy) {}
  assertWritable(
    companyId: string,
    from: string,
    to: string,
    session?: mongoose.ClientSession,
  ) {
    return this.periods.assertWritable(companyId, from, to, session);
  }
  async decision(
    actor: Principal,
    requestId: string,
    decision: "Approved" | "Rejected",
    correlationId: string,
    overtime = false,
  ) {
    requirePermission(actor, (overtime ? "overtime" : "leave") + ".approve");
    return mongoose.connection.transaction(async (session) => {
      const request = overtime
        ? await OvertimeRequest.findOne({
            _id: requestId,
            companyId: actor.companyId,
            status: "Pending",
          }).session(session)
        : await LeaveRequest.findOne({
            _id: requestId,
            companyId: actor.companyId,
            status: "Pending",
          }).session(session);
      if (!request)
        throw new AppError(404, "NOT_FOUND", "Pending request not found");
      await findEmployee(actor, String(request.employeeId), session);
      if (String(request.requestedBy) === actor.userId) throw deny();
      if (!overtime) {
        const leave = request as InstanceType<typeof LeaveRequest>;
        await this.periods.assertWritable(
          actor.companyId,
          leave.startDate,
          leave.endDate,
          session,
        );
        if (decision === "Approved") {
          const type = await LeaveType.findOne({
            _id: leave.leaveTypeId,
            companyId: actor.companyId,
          }).session(session);
          if (!type)
            throw new AppError(422, "INVALID_POLICY", "Leave policy missing");
          if (type.paid) {
            const balance = await LeaveBalance.findOneAndUpdate(
              {
                companyId: actor.companyId,
                employeeId: leave.employeeId,
                leaveTypeId: leave.leaveTypeId,
                units: { $gte: leave.units },
              },
              { $inc: { units: -leave.units } },
              { new: true, session },
            );
            if (!balance)
              throw new AppError(
                422,
                "INSUFFICIENT_LEAVE",
                "Insufficient leave credits",
              );
            await LeaveTransaction.create(
              [
                {
                  companyId: actor.companyId,
                  employeeId: leave.employeeId,
                  departmentId: leave.departmentId,
                  leaveTypeId: leave.leaveTypeId,
                  units: -leave.units,
                  reason: "Approved leave",
                  requestId: leave.id,
                  actorId: actor.userId,
                },
              ],
              { session },
            );
          }
        }
      }
      if (overtime) {
        const entry = request as InstanceType<typeof OvertimeRequest>;
        await this.periods.assertWritable(
          actor.companyId,
          entry.day,
          entry.day,
          session,
        );
      }
      request.status = decision;
      request.approvedBy = new mongoose.Types.ObjectId(actor.userId);
      await request.save({ session });
      await audit(
        actor,
        (overtime ? "overtime" : "leave") + "." + decision,
        request.id,
        correlationId,
        request.reason,
        session,
      );
      await notify(
        actor.companyId,
        String(request.requestedBy),
        (overtime ? "Overtime" : "Leave") +
          " request " +
          decision.toLowerCase(),
        overtime ? "/overtime" : "/leave",
        session,
      );
      return request;
    });
  }
}

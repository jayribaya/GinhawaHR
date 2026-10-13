import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { handler, ok } from "../../common/http.js";
import {
  LeaveRequest,
  LeaveType,
  LeaveBalance,
  LeaveTransaction,
  OvertimeRequest,
} from "../../infrastructure/models.js";
import { requirePermission } from "../roles/policy.js";
import { id, date } from "../employees/validators.js";
import { findEmployee } from "../employees/repository.js";
import { scopedEmployeeIds } from "../attendance/routes.js";
import { LeaveService } from "./service.js";
import { AppError, deny } from "../../common/errors.js";
import { audit } from "../../infrastructure/audit.js";
export function leaveRoutes(service: LeaveService, overtime = false) {
  const router = Router(),
    prefix = overtime ? "overtime" : "leave";
  router.get(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, prefix + ".read");
      const filter = {
        companyId: req.actor.companyId,
        employeeId: { $in: await scopedEmployeeIds(req.actor) },
      };
      ok(
        res,
        overtime
          ? await OvertimeRequest.find(filter)
              .populate("employeeId", "firstName lastName")
              .sort({ createdAt: -1 })
              .limit(100)
          : await LeaveRequest.find(filter)
              .populate("employeeId", "firstName lastName")
              .populate("leaveTypeId", "name")
              .sort({ createdAt: -1 })
              .limit(100),
      );
    }),
  );
  router.post(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, prefix + ".write");
      const common = {
        employeeId: id.optional(),
        reason: z.string().min(3).max(500),
      };
      const data = overtime
        ? z
            .object({
              ...common,
              day: date,
              minutes: z.number().int().min(1).max(1440),
            })
            .strict()
            .parse(req.body)
        : z
            .object({
              ...common,
              leaveTypeId: id,
              startDate: date,
              endDate: date,
              units: z.number().min(0.5).max(366).multipleOf(0.5),
            })
            .strict()
            .refine((d) => d.startDate <= d.endDate, {
              message: "Invalid date range",
            })
            .parse(req.body);
      const employeeId = data.employeeId ?? req.actor.employeeId;
      if (!employeeId)
        throw new AppError(422, "NO_EMPLOYEE", "Choose an employee");
      const employee = await findEmployee(req.actor, employeeId);
      if ("startDate" in data)
        await service.assertWritable(
          req.actor.companyId,
          data.startDate,
          data.endDate,
        );
      else
        await service.assertWritable(req.actor.companyId, data.day, data.day);
      if (
        "leaveTypeId" in data &&
        !(await LeaveType.exists({
          _id: data.leaveTypeId,
          companyId: req.actor.companyId,
        }))
      )
        throw new AppError(
          422,
          "INVALID_REFERENCE",
          "Leave category not found",
        );
      const payload = {
        ...data,
        employeeId,
        departmentId: employee.departmentId,
        companyId: req.actor.companyId,
        requestedBy: req.actor.userId,
      };
      ok(
        res.status(201),
        overtime
          ? await OvertimeRequest.create(payload)
          : await LeaveRequest.create(payload),
      );
    }),
  );
  router.post(
    "/:id/decision",
    handler(async (req, res) =>
      ok(
        res,
        await service.decision(
          req.actor,
          id.parse(req.params.id),
          z
            .object({ decision: z.enum(["Approved", "Rejected"]) })
            .strict()
            .parse(req.body).decision,
          req.correlationId,
          overtime,
        ),
      ),
    ),
  );
  if (!overtime) {
    router.get(
      "/balances/list",
      handler(async (req, res) => {
        requirePermission(req.actor, "leave.read");
        ok(
          res,
          await LeaveBalance.find({
            companyId: req.actor.companyId,
            employeeId: { $in: await scopedEmployeeIds(req.actor) },
          })
            .populate("employeeId", "firstName lastName")
            .populate("leaveTypeId", "name"),
        );
      }),
    );
    router.post(
      "/balances/adjust",
      handler(async (req, res) => {
        requirePermission(req.actor, "leave.approve");
        if (req.actor.scope !== "company") throw deny();
        const data = z
          .object({
            employeeId: id,
            leaveTypeId: id,
            units: z.number().min(-366).max(366).multipleOf(0.5),
            reason: z.string().min(3),
          })
          .strict()
          .parse(req.body);
        const employee = await findEmployee(req.actor, data.employeeId);
        if (
          !(await LeaveType.exists({
            _id: data.leaveTypeId,
            companyId: req.actor.companyId,
          }))
        )
          throw new AppError(
            422,
            "INVALID_REFERENCE",
            "Leave category not found",
          );
        const balance = await mongoose.connection.transaction(
          async (session) => {
            const filter = {
              companyId: req.actor.companyId,
              employeeId: data.employeeId,
              leaveTypeId: data.leaveTypeId,
            };
            const current = await LeaveBalance.findOne(filter).session(session);
            if ((current?.units ?? 0) + data.units < 0)
              throw new AppError(
                422,
                "NEGATIVE_BALANCE",
                "Leave balance cannot be negative",
              );
            const record = await LeaveBalance.findOneAndUpdate(
              filter,
              {
                $inc: { units: data.units },
                $set: { departmentId: employee.departmentId },
              },
              { new: true, upsert: true, session },
            );
            await LeaveTransaction.create(
              [
                {
                  ...filter,
                  departmentId: employee.departmentId,
                  units: data.units,
                  reason: data.reason,
                  actorId: req.actor.userId,
                },
              ],
              { session },
            );
            await audit(
              req.actor,
              "leave.balance.adjust",
              data.employeeId,
              req.correlationId,
              data.reason,
              session,
            );
            return record;
          },
        );
        ok(res, balance);
      }),
    );
  }
  return router;
}

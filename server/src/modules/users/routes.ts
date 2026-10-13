import { Router } from "express";
import { z } from "zod";
import {
  User,
  Role,
  Session,
  Department,
} from "../../infrastructure/models.js";
import { handler, ok } from "../../common/http.js";
import { requirePermission } from "../roles/policy.js";
import { AppError, deny } from "../../common/errors.js";
import { id } from "../employees/validators.js";
import { findEmployee } from "../employees/repository.js";
import { AuthService } from "../auth/service.js";
import { audit } from "../../infrastructure/audit.js";
export function userRoutes(auth: AuthService) {
  const router = Router();
  router.get(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, "users.read");
      if (req.actor.scope !== "company") throw deny();
      ok(
        res,
        await User.find({ companyId: req.actor.companyId })
          .populate("roleId", "name")
          .limit(100),
      );
    }),
  );
  router.post(
    "/invite",
    handler(async (req, res) => {
      requirePermission(req.actor, "users.write");
      requirePermission(req.actor, "roles.write");
      if (req.actor.scope !== "company") throw deny();
      const data = z
        .object({
          name: z.string().min(1),
          email: z.email().transform((v) => v.toLowerCase()),
          roleId: id,
          employeeId: id.optional(),
          departmentIds: z.array(id).default([]),
        })
        .strict()
        .parse(req.body);
      const role = await Role.findOne({
        _id: data.roleId,
        companyId: req.actor.companyId,
      });
      if (!role) throw new AppError(422, "INVALID_REFERENCE", "Role not found");
      if (
        new Set(data.departmentIds).size !== data.departmentIds.length ||
        (await Department.countDocuments({
          companyId: req.actor.companyId,
          _id: { $in: data.departmentIds },
        })) !== data.departmentIds.length
      )
        throw new AppError(
          422,
          "INVALID_REFERENCE",
          "Invalid department assignments",
        );
      if (role.scope === "self" && !data.employeeId)
        throw new AppError(
          422,
          "EMPLOYEE_REQUIRED",
          "Self-scoped accounts require an employee link",
        );
      if (data.employeeId) await findEmployee(req.actor, data.employeeId);
      await User.create({ ...data, companyId: req.actor.companyId });
      const token = await auth.passwordToken(data.email, "invitation");
      await audit(
        req.actor,
        "user.invite",
        data.email.includes("@") ? "invited-account" : "account",
        req.correlationId,
      );
      ok(res.status(201), {
        invitationToken: token,
        message: "Deliver this single-use token through a secure channel.",
      });
    }),
  );
  router.patch(
    "/:id/access",
    handler(async (req, res) => {
      requirePermission(req.actor, "users.write");
      requirePermission(req.actor, "roles.write");
      if (req.actor.scope !== "company") throw deny();
      const userId = id.parse(req.params.id);
      if (userId === req.actor.userId)
        throw new AppError(
          422,
          "SELF_CHANGE",
          "Another administrator must change your access",
        );
      const data = z
        .object({ roleId: id, active: z.boolean(), departmentIds: z.array(id) })
        .strict()
        .parse(req.body);
      if (
        !(await Role.exists({
          _id: data.roleId,
          companyId: req.actor.companyId,
        }))
      )
        throw new AppError(422, "INVALID_REFERENCE", "Role not found");
      if (
        new Set(data.departmentIds).size !== data.departmentIds.length ||
        (await Department.countDocuments({
          companyId: req.actor.companyId,
          _id: { $in: data.departmentIds },
        })) !== data.departmentIds.length
      )
        throw new AppError(
          422,
          "INVALID_REFERENCE",
          "Invalid department assignments",
        );
      const user = await User.findOneAndUpdate(
        { _id: userId, companyId: req.actor.companyId },
        { $set: data },
        { new: true },
      );
      if (!user) throw new AppError(404, "NOT_FOUND", "Record not found");
      await Session.updateMany({ userId }, { $set: { revokedAt: new Date() } });
      await audit(req.actor, "user.access.change", userId, req.correlationId);
      ok(res, user);
    }),
  );
  router.post(
    "/:id/reset-token",
    handler(async (req, res) => {
      requirePermission(req.actor, "users.write");
      if (req.actor.scope !== "company") throw deny();
      const user = await User.findOne({
        _id: id.parse(req.params.id),
        companyId: req.actor.companyId,
        active: true,
      });
      if (!user)
        throw new AppError(404, "NOT_FOUND", "Active account not found");
      const token = await auth.passwordToken(user.email, "reset");
      await audit(req.actor, "user.reset.issue", user.id, req.correlationId);
      ok(res, {
        invitationToken: token,
        message:
          "Deliver this single-use reset token through a secure channel.",
      });
    }),
  );
  return router;
}

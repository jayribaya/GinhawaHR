import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import * as models from "../../infrastructure/models.js";
import { handler, ok } from "../../common/http.js";
import { requirePermission } from "../roles/policy.js";
import { audit } from "../../infrastructure/audit.js";
import { AppError, deny } from "../../common/errors.js";
import { id, date, money } from "../employees/validators.js";
import { findEmployee } from "../employees/repository.js";
import { permissions } from "../roles/policy.js";
import { validateBrackets, type Bracket } from "../payroll/domain.js";
const organization = z
  .object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(30),
    active: z.boolean().default(true),
  })
  .strict();
const resources = {
  departments: {
    model: models.Department,
    permission: "organization",
    schema: organization,
  },
  branches: {
    model: models.Branch,
    permission: "organization",
    schema: organization,
  },
  positions: {
    model: models.Position,
    permission: "organization",
    schema: organization,
  },
  schedules: {
    model: models.Schedule,
    permission: "attendance",
    schema: z
      .object({
        name: z.string().min(1),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(0).max(1439),
        breakMinutes: z.number().int().min(0).max(480),
        workdays: z.array(z.number().int().min(0).max(6)).min(1),
        effectiveFrom: date,
      })
      .strict(),
  },
  holidays: {
    model: models.Holiday,
    permission: "organization",
    schema: z
      .object({
        name: z.string().min(1),
        day: date,
        kind: z.enum(["regular", "special", "company"]),
        source: z.string().min(1),
      })
      .strict(),
  },
  "leave-types": {
    model: models.LeaveType,
    permission: "leave",
    schema: z
      .object({
        name: z.string().min(1),
        paid: z.boolean(),
        annualUnits: z.number().min(0).max(366),
        effectiveFrom: date,
        verified: z.boolean().default(false),
      })
      .strict(),
  },
  "pay-items": {
    model: models.PayItem,
    permission: "compensation",
    schema: z
      .object({
        name: z.string().min(1),
        kind: z.enum(["earning", "deduction"]),
        taxable: z.boolean(),
        contributionRelevant: z.boolean(),
        active: z.boolean().default(true),
      })
      .strict(),
  },
  "payroll-periods": {
    model: models.PayrollPeriod,
    permission: "payroll",
    schema: z
      .object({
        name: z.string().min(1),
        startDate: date,
        endDate: date,
        payDate: date,
        periodUnits: z.number().int().min(1).max(100000),
        salaryDivisor: z.number().int().min(1).max(100000),
      })
      .strict()
      .refine((d) => d.startDate <= d.endDate && d.payDate >= d.endDate, {
        message: "Invalid payroll dates",
      }),
  },
  roles: {
    model: models.Role,
    permission: "roles",
    schema: z
      .object({
        name: z.string().min(1).max(100),
        permissions: z.array(z.enum(permissions)),
        scope: z.enum(["company", "department", "self"]),
      })
      .strict(),
  },
};
export function settingsRoutes() {
  const router = Router();
  for (const [path, definition] of Object.entries(resources)) {
    const model = definition.model as mongoose.Model<unknown>;
    router.get(
      `/${path}`,
      handler(async (req, res) => {
        requirePermission(req.actor, definition.permission + ".read");
        const query = {
          companyId: req.actor.companyId,
          ...(req.actor.scope === "department" && path === "departments"
            ? { _id: { $in: req.actor.departmentIds } }
            : {}),
        };
        ok(res, await model.find(query).sort({ _id: -1 }).limit(100));
      }),
    );
    router.post(
      `/${path}`,
      handler(async (req, res) => {
        requirePermission(
          req.actor,
          path === "payroll-periods"
            ? "payroll.prepare"
            : definition.permission + ".write",
        );
        if (req.actor.scope !== "company") throw deny();
        const data = definition.schema.parse(req.body);
        const result = await mongoose.connection.transaction(
          async (session) => {
            const [record] = await model.create(
              [{ ...data, companyId: req.actor.companyId }],
              { session },
            );
            await audit(
              req.actor,
              path + ".create",
              String((record as { _id: unknown })._id),
              req.correlationId,
              undefined,
              session,
            );
            return record;
          },
        );
        ok(res.status(201), result);
      }),
    );
    if (
      ![
        "payroll-periods",
        "roles",
        "leave-types",
        "pay-items",
        "schedules",
      ].includes(path)
    )
      router.put(
        `/${path}/:id`,
        handler(async (req, res) => {
          requirePermission(req.actor, definition.permission + ".write");
          if (req.actor.scope !== "company") throw deny();
          const data = definition.schema.parse(req.body);
          const record = await model.findOneAndUpdate(
            { _id: id.parse(req.params.id), companyId: req.actor.companyId },
            { $set: data },
            { new: true, runValidators: true },
          );
          if (!record) throw new AppError(404, "NOT_FOUND", "Record not found");
          await audit(
            req.actor,
            path + ".update",
            String(req.params.id),
            req.correlationId,
          );
          ok(res, record);
        }),
      );
  }
  router.get(
    "/company",
    handler(async (req, res) =>
      ok(res, await models.Company.findById(req.actor.companyId)),
    ),
  );
  router.put(
    "/company",
    handler(async (req, res) => {
      requirePermission(req.actor, "settings.write");
      if (req.actor.scope !== "company") throw deny();
      const data = z
        .object({
          name: z.string().min(1).max(150),
          address: z.string().max(500),
        })
        .strict()
        .parse(req.body);
      const company = await models.Company.findByIdAndUpdate(
        req.actor.companyId,
        { $set: data },
        { new: true },
      );
      await audit(
        req.actor,
        "company.update",
        req.actor.companyId,
        req.correlationId,
      );
      ok(res, company);
    }),
  );
  router.get(
    "/settings",
    handler(async (req, res) => {
      requirePermission(req.actor, "settings.read");
      ok(
        res,
        await models.Setting.find({ companyId: req.actor.companyId })
          .sort({ version: -1 })
          .limit(100),
      );
    }),
  );
  router.post(
    "/settings",
    handler(async (req, res) => {
      requirePermission(req.actor, "settings.write");
      if (req.actor.scope !== "company") throw deny();
      const data = z
        .object({
          key: z.string().min(1).max(100),
          version: z.number().int().min(1),
          value: z.record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean()]),
          ),
          reason: z.string().min(3),
        })
        .strict()
        .parse(req.body);
      const setting = await models.Setting.create({
        ...data,
        companyId: req.actor.companyId,
      });
      await audit(
        req.actor,
        "settings.version.create",
        setting.id,
        req.correlationId,
        data.reason,
      );
      ok(res.status(201), setting);
    }),
  );
  router.get(
    "/statutory",
    handler(async (req, res) => {
      requirePermission(req.actor, "statutory.read");
      ok(
        res,
        await models.StatutoryRuleVersion.find({
          companyId: req.actor.companyId,
        }).sort({ effectiveFrom: -1 }),
      );
    }),
  );
  router.post(
    "/statutory",
    handler(async (req, res) => {
      requirePermission(req.actor, "statutory.write");
      if (req.actor.scope !== "company") throw deny();
      const bracket = z
        .object({
          lower: money,
          upper: money.nullable(),
          fixed: money,
          rateBps: z.number().int().min(0).max(10000),
        })
        .strict();
      const data = z
        .object({
          kind: z.enum(["SSS", "PhilHealth", "PagIBIG", "BIR"]),
          version: z.string().min(1),
          effectiveFrom: date,
          effectiveTo: date.optional(),
          source: z.url(),
          policy: z
            .object({
              baseCeiling: money.optional(),
              employeeBps: z.number().int().min(0).max(10000).optional(),
              employerBps: z.number().int().min(0).max(10000).optional(),
              brackets: z.array(bracket).optional(),
            })
            .strict(),
        })
        .strict()
        .parse(req.body);
      if (data.policy.brackets)
        validateBrackets(data.policy.brackets as Bracket[]);
      if (data.effectiveTo && data.effectiveTo < data.effectiveFrom)
        throw new AppError(422, "INVALID_DATES", "Invalid effective dates");
      const result = await models.StatutoryRuleVersion.create({
        ...data,
        verified: false,
        companyId: req.actor.companyId,
      });
      await audit(req.actor, "statutory.upload", result.id, req.correlationId);
      ok(res.status(201), result);
    }),
  );
  // This engine supports preview only. Verification/finalization is deliberately unavailable
  // until statutory method applicability, SSS MSC/EC and tax annualization are implemented.
  router.post(
    "/schedule-assignments",
    handler(async (req, res) => {
      requirePermission(req.actor, "attendance.write");
      if (req.actor.scope !== "company") throw deny();
      const data = z
        .object({
          employeeId: id,
          scheduleId: id,
          effectiveFrom: date,
          effectiveTo: date.optional(),
        })
        .strict()
        .parse(req.body);
      const employee = await findEmployee(req.actor, data.employeeId);
      if (
        !(await models.Schedule.exists({
          _id: data.scheduleId,
          companyId: req.actor.companyId,
        }))
      )
        throw new AppError(422, "INVALID_REFERENCE", "Schedule not found");
      ok(
        res.status(201),
        await models.ScheduleAssignment.create({
          ...data,
          companyId: req.actor.companyId,
          departmentId: employee.departmentId,
        }),
      );
    }),
  );
  return router;
}

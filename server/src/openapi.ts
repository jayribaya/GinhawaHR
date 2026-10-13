import { z } from "zod";
import {
  employeeDto,
  id,
  date,
  money,
} from "./modules/employees/validators.js";
import { permissions } from "./modules/roles/policy.js";
const collectionPaths = [
  "employees",
  "departments",
  "branches",
  "positions",
  "schedules",
  "holidays",
  "leave-types",
  "pay-items",
  "payroll-periods",
  "roles",
  "statutory",
  "settings",
  "attendance",
  "leave",
  "overtime",
  "payroll",
  "payslips",
  "loans",
  "payments",
  "users",
  "notifications",
  "audit",
];
const response = {
  description: "Response envelope",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { data: {}, meta: { type: "object" } },
      },
    },
  },
};
const paths: Record<string, Record<string, unknown>> = Object.fromEntries(
  collectionPaths.map((path) => [
    "/" + path,
    {
      get: {
        summary: "List authorized " + path,
        responses: {
          200: response,
          401: { description: "Authentication required" },
          403: { description: "Permission denied" },
        },
      },
    },
  ]),
);
const text = z.string(),
  reason = text.min(3).max(500),
  revision = z.number().int().min(0);
const organization = z
  .object({
    name: text.min(1).max(100),
    code: text.min(1).max(30),
    active: z.boolean().default(true),
  })
  .strict();
const bracket = z
  .object({
    lower: money,
    upper: money.nullable(),
    fixed: money,
    rateBps: z.number().int().min(0).max(10000),
  })
  .strict();
const dtos: Record<string, z.ZodType> = {
  employees: employeeDto,
  departments: organization,
  branches: organization,
  positions: organization,
  schedules: z
    .object({
      name: text,
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(0).max(1439),
      breakMinutes: z.number().int().min(0).max(480),
      workdays: z.array(z.number().int().min(0).max(6)),
      effectiveFrom: date,
    })
    .strict(),
  holidays: z
    .object({
      name: text,
      day: date,
      kind: z.enum(["regular", "special", "company"]),
      source: text,
    })
    .strict(),
  "leave-types": z
    .object({
      name: text,
      paid: z.boolean(),
      annualUnits: z.number().min(0).max(366),
      effectiveFrom: date,
      verified: z.boolean().default(false),
    })
    .strict(),
  "pay-items": z
    .object({
      name: text,
      kind: z.enum(["earning", "deduction"]),
      taxable: z.boolean(),
      contributionRelevant: z.boolean(),
      active: z.boolean().default(true),
    })
    .strict(),
  "payroll-periods": z
    .object({
      name: text,
      startDate: date,
      endDate: date,
      payDate: date,
      periodUnits: z.number().int().min(1),
      salaryDivisor: z.number().int().min(1),
    })
    .strict(),
  roles: z
    .object({
      name: text,
      permissions: z.array(z.enum(permissions)),
      scope: z.enum(["company", "department", "self"]),
    })
    .strict(),
  statutory: z
    .object({
      kind: z.enum(["SSS", "PhilHealth", "PagIBIG", "BIR"]),
      version: text,
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
    .strict(),
  settings: z
    .object({
      key: text,
      version: z.number().int().min(1),
      value: z.record(text, z.union([text, z.number(), z.boolean()])),
      reason,
    })
    .strict(),
  leave: z
    .object({
      employeeId: id.optional(),
      leaveTypeId: id,
      startDate: date,
      endDate: date,
      units: z.number().min(0.5).max(366).multipleOf(0.5),
      reason,
    })
    .strict(),
  overtime: z
    .object({
      employeeId: id.optional(),
      day: date,
      minutes: z.number().int().min(1).max(1440),
      reason,
    })
    .strict(),
  payroll: z.object({ periodId: id }).strict(),
  loans: z
    .object({
      employeeId: id,
      name: text,
      principal: money,
      installment: money,
      effectiveFrom: date,
      reason,
    })
    .strict(),
  payments: z.object({ runId: id }).strict(),
};
function operation(
  path: string,
  method: string,
  summary: string,
  body?: z.ZodType,
  publicRoute = false,
) {
  paths[path] ??= {};
  paths[path]![method] = {
    summary,
    tags: [path.split("/")[1]],
    ...(publicRoute ? { security: [] } : {}),
    parameters: path.includes("{id}")
      ? [
          {
            in: "path",
            name: "id",
            required: true,
            schema: z.toJSONSchema(id, { target: "openapi-3.0" }),
          },
        ]
      : [],
    responses: {
      200: response,
      201: response,
      401: { description: "Authentication required" },
      403: { description: "Permission denied" },
      404: { description: "Not found or outside scope" },
      409: { description: "Revision/state/duplicate conflict" },
      422: { description: "Validation or financial gate" },
      429: { description: "Rate limit exceeded" },
    },
    ...(body
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: z.toJSONSchema(body, {
                  target: "openapi-3.0",
                  unrepresentable: "any",
                }),
              },
            },
          },
        }
      : {}),
  };
}
for (const [name, schema] of Object.entries(dtos))
  operation("/" + name, "post", "Create " + name, schema);
for (const name of [
  "departments",
  "branches",
  "positions",
  "holidays",
  "employees",
])
  operation("/" + name + "/{id}", "put", "Update " + name, dtos[name]);
operation("/employees/{id}", "get", "Read a scoped employee");
operation("/employees/{id}/history", "get", "Read employment history");
operation("/employees/{id}/salaries", "get", "Read restricted salary history");
operation(
  "/employees/{id}/salaries",
  "post",
  "Create effective salary version",
  z
    .object({
      amount: money,
      basis: z.enum(["monthly", "semi-monthly", "daily", "hourly"]),
      effectiveDate: date,
      reason,
    })
    .strict(),
);
operation(
  "/auth/login",
  "post",
  "Sign in",
  z.object({
    email: z.email(),
    password: text.max(128),
    totp: text.optional(),
  }),
  true,
);
operation(
  "/auth/refresh",
  "post",
  "Rotate refresh cookie; exact Origin and x-csrf-token required",
  undefined,
  true,
);
operation(
  "/auth/logout",
  "post",
  "Revoke cookie session; exact Origin and CSRF required",
  undefined,
  true,
);
operation(
  "/auth/forgot-password",
  "post",
  "Record recovery request for administrator delivery",
  z.object({ email: z.email() }),
  true,
);
operation(
  "/auth/reset-password",
  "post",
  "Redeem single-use invitation/reset token",
  z.object({ token: text.min(20), password: text.min(12).max(128) }),
  true,
);
operation("/auth/me", "get", "Read current principal");
operation("/auth/sessions", "get", "Read own sessions");
operation("/auth/sessions/{id}", "delete", "Revoke own session");
operation(
  "/auth/change-password",
  "post",
  "Change password and revoke sessions",
  z.object({ current: text, password: text.min(12).max(128) }),
);
operation(
  "/auth/mfa/setup",
  "post",
  "Enroll authenticator with password confirmation",
  z.object({ current: text.max(128) }).strict(),
);
operation(
  "/auth/mfa/enable",
  "post",
  "Confirm MFA enrollment",
  z.object({ code: text.length(6) }),
);
operation("/company", "get", "Read employer profile");
operation(
  "/company",
  "put",
  "Update employer profile",
  z.object({ name: text.min(1).max(150), address: text.max(500) }).strict(),
);
operation(
  "/users/invite",
  "post",
  "Invite user; users.write and roles.write required",
  z
    .object({
      name: text,
      email: z.email(),
      roleId: id,
      employeeId: id.optional(),
      departmentIds: z.array(id).default([]),
    })
    .strict(),
);
operation(
  "/users/{id}/access",
  "patch",
  "Change account access and revoke sessions",
  z
    .object({ roleId: id, active: z.boolean(), departmentIds: z.array(id) })
    .strict(),
);
operation(
  "/users/{id}/reset-token",
  "post",
  "Issue reset token for secure administrator delivery",
);
operation(
  "/attendance/clock",
  "post",
  "Record own clock event",
  z.object({ action: z.enum(["in", "out"]) }),
);
operation(
  "/attendance/import",
  "post",
  "Atomic CSV import",
  z.object({ csv: text.max(900000), reason }).strict(),
);
operation("/attendance/adjustments", "get", "Read scoped corrections");
operation(
  "/attendance/adjustments",
  "post",
  "Request correction",
  z
    .object({
      attendanceId: id,
      clockIn: z.iso.datetime(),
      clockOut: z.iso.datetime(),
      reason,
    })
    .strict(),
);
const decision = z
  .object({ decision: z.enum(["Approved", "Rejected"]) })
  .strict();
for (const path of [
  "/attendance/adjustments/{id}/decision",
  "/leave/{id}/decision",
  "/overtime/{id}/decision",
])
  operation(path, "post", "Decide scoped request; no self-approval", decision);
operation(
  "/schedule-assignments",
  "post",
  "Assign effective schedule",
  z
    .object({
      employeeId: id,
      scheduleId: id,
      effectiveFrom: date,
      effectiveTo: date.optional(),
    })
    .strict(),
);
operation("/leave/balances/list", "get", "Read scoped balances");
operation(
  "/leave/balances/adjust",
  "post",
  "Post credit adjustment",
  z
    .object({
      employeeId: id,
      leaveTypeId: id,
      units: z.number().min(-366).max(366).multipleOf(0.5),
      reason,
    })
    .strict(),
);
operation("/payroll/{id}", "get", "Read run and financial snapshots");
operation(
  "/payroll/{id}/calculate",
  "post",
  "Calculate draft/rejected preview",
  z.object({ revision }).strict(),
);
operation(
  "/payroll/{id}/transition",
  "post",
  "Review/approve/reject/finalize; mandatory finalization gate",
  z
    .object({
      status: z.enum(["Under Review", "Approved", "Rejected", "Finalized"]),
      revision,
      reason,
    })
    .strict(),
);
(paths["/payroll"]!.post as Record<string, unknown>).parameters = [
  {
    in: "header",
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 100 },
  },
];
operation("/payslips/{id}/release", "post", "Release finalized payslip");
operation(
  "/payslips/{id}/pdf",
  "get",
  "Download authorized server-generated PDF",
);
(paths["/payslips/{id}/pdf"]!.get as Record<string, unknown>).responses = {
  200: {
    description: "PDF payslip",
    content: {
      "application/pdf": { schema: { type: "string", format: "binary" } },
    },
  },
  404: { description: "Not found or outside scope" },
};
operation("/loans/{id}/repayments", "get", "Read scoped repayments");
operation("/payments/{id}/approve", "post", "Independent payout approval");
operation("/payments/{id}/export", "post", "Export payout CSV once");
operation(
  "/payments/{id}/reconcile",
  "post",
  "Record external payment confirmation",
  z.object({ reference: text.min(3).max(100) }).strict(),
);
operation(
  "/reports/payroll",
  "get",
  "Payroll register; from/to/format=csv supported",
);
operation("/reports/payroll/{id}/items", "get", "Read payroll register items");
operation("/dashboard", "get", "Scope-aware overview");
operation(
  "/notifications/{id}/read",
  "patch",
  "Mark own notification read",
  z.object({}).strict(),
);
operation(
  "/health",
  "get",
  "Readiness without deployment secrets",
  undefined,
  true,
);
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "GinhawaHR API",
    version: "0.1.0",
    description:
      "Implemented API. Money is integer-centavo strings. Payroll finalization is blocked pending statutory engine completion.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths,
};

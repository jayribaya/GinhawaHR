import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import argon2 from "argon2";
import request from "supertest";
import { createApp } from "../src/app.js";
import * as m from "../src/infrastructure/models.js";
import { defaults } from "../src/modules/roles/policy.js";
import type { Config } from "../src/config/env.js";
import { encrypt } from "../src/infrastructure/crypto.js";
import { authenticator } from "otplib";
let replica: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
let employeeToken = "",
  adminToken = "",
  approverToken = "",
  managerToken = "",
  employeeId = "",
  otherEmployeeId = "",
  periodId = "",
  runId = "",
  leaveTypeId = "";
const config: Config = {
  NODE_ENV: "test",
  PORT: 4000,
  MONGODB_URI: "",
  APP_ORIGIN: "http://localhost:5173",
  JWT_SECRET: "test-secret-for-fixtures-only-32-characters",
  FIELD_ENCRYPTION_KEY: "ab".repeat(32),
};
const password = "Fictional_Test_Password_123!";
async function login(email: string) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replica.getUri());
  app = createApp({ ...config, MONGODB_URI: replica.getUri() });
  const company = await m.Company.create({ name: "Fictional test company" });
  const roles = await m.Role.create(
    Object.entries(defaults).map(([name, d]) => ({
      companyId: company.id,
      name,
      ...d,
    })),
  );
  const department = await m.Department.create({
    companyId: company.id,
    name: "Test department",
    code: "TEST",
  });
  const otherDepartment = await m.Department.create({
    companyId: company.id,
    name: "Other department",
    code: "OTHER",
  });
  const branch = await m.Branch.create({
    companyId: company.id,
    name: "Test branch",
    code: "BR",
  });
  const employee = await m.Employee.create({
    companyId: company.id,
    employeeNumber: "E1",
    firstName: "Test",
    lastName: "One",
    email: "one@example.test",
    departmentId: department.id,
    branchId: branch.id,
    hireDate: "2024-01-01",
    status: "Active",
  });
  const other = await m.Employee.create({
    companyId: company.id,
    employeeNumber: "E2",
    firstName: "Test",
    lastName: "Two",
    email: "two@example.test",
    departmentId: otherDepartment.id,
    branchId: branch.id,
    hireDate: "2024-01-01",
    status: "Active",
  });
  employeeId = employee.id;
  otherEmployeeId = other.id;
  const passwordHash = await argon2.hash(password);
  for (const [email, role, employeeLink] of [
    ["employee@example.test", "Employee", employee.id],
    ["admin@example.test", "Super Administrator", null],
    ["approver@example.test", "Payroll Approver", null],
    ["manager@example.test", "Department Manager", null],
  ])
    await m.User.create({
      companyId: company.id,
      name: email,
      email,
      passwordHash,
      roleId: roles.find((r) => r.name === role)!.id,
      ...(employeeLink ? { employeeId: employeeLink } : {}),
      departmentIds: role === "Department Manager" ? [department.id] : [],
    });
  const admin = await m.User.findOne({ email: "admin@example.test" });
  await m.SalaryHistory.create(
    [employee, other].map((e) => ({
      companyId: company.id,
      employeeId: e.id,
      departmentId: e.departmentId,
      amount: "3000000",
      basis: "monthly",
      effectiveDate: "2024-01-01",
      reason: "Test fixture",
      actorId: admin!.id,
    })),
  );
  const period = await m.PayrollPeriod.create({
    companyId: company.id,
    name: "Test cutoff",
    startDate: "2026-10-01",
    endDate: "2026-10-15",
    payDate: "2026-10-20",
    periodUnits: 15,
    salaryDivisor: 2,
  });
  periodId = period.id;
  const leaveType = await m.LeaveType.create({
    companyId: company.id,
    name: "Test leave",
    paid: true,
    annualUnits: 5,
    effectiveFrom: "2024-01-01",
  });
  leaveTypeId = leaveType.id;
  await m.LeaveBalance.create({
    companyId: company.id,
    employeeId: employee.id,
    departmentId: department.id,
    leaveTypeId,
    units: 5,
  });
  await Promise.all(Object.values(m).map((model) => model.init()));
  employeeToken = (await login("employee@example.test")).body.data.accessToken;
  adminToken = (await login("admin@example.test")).body.data.accessToken;
  approverToken = (await login("approver@example.test")).body.data.accessToken;
  managerToken = (await login("manager@example.test")).body.data.accessToken;
});
afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});
describe("authentication and resource authorization", () => {
  it("redeems administrator-issued recovery once and revokes old sessions", async () => {
    const company = await m.Company.findOne(),
      role = await m.Role.findOne({ name: "HR Administrator" });
    const user = await m.User.create({
      companyId: company!.id,
      name: "Recovery Fixture",
      email: "recovery@example.test",
      roleId: role!.id,
      passwordHash: await argon2.hash(password),
    });
    const oldLogin = await login(user.email);
    const issued = await request(app)
      .post("/api/v1/users/" + user.id + "/reset-token")
      .auth(adminToken, { type: "bearer" })
      .send({});
    expect(issued.status).toBe(200);
    const newPassword = "Fictional_Recovery_Second_123!";
    const redeem = () =>
      request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: issued.body.data.invitationToken,
          password: newPassword,
        });
    expect((await redeem()).status).toBe(200);
    expect((await redeem()).status).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/v1/auth/me")
          .auth(oldLogin.body.data.accessToken, { type: "bearer" })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: user.email, password: newPassword })
      ).status,
    ).toBe(200);
  });
  it("requires password-confirmed MFA enrollment and rejects login-code replay", async () => {
    const company = await m.Company.findOne(),
      role = await m.Role.findOne({ name: "HR Administrator" });
    const user = await m.User.create({
      companyId: company!.id,
      name: "MFA Fixture",
      email: "mfa@example.test",
      roleId: role!.id,
      passwordHash: await argon2.hash(password),
    });
    const first = await login(user.email),
      token = first.body.data.accessToken;
    expect(
      (
        await request(app)
          .post("/api/v1/auth/mfa/setup")
          .auth(token, { type: "bearer" })
          .send({ current: "incorrect" })
      ).status,
    ).toBe(401);
    const setup = await request(app)
      .post("/api/v1/auth/mfa/setup")
      .auth(token, { type: "bearer" })
      .send({ current: password });
    expect(setup.status).toBe(200);
    const code = authenticator.generate(setup.body.data.secret);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/mfa/enable")
          .auth(token, { type: "bearer" })
          .send({ code })
      ).status,
    ).toBe(200);
    expect((await login(user.email)).status).toBe(401);
    const withCode = () =>
      request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password, totp: code });
    expect((await withCode()).status).toBe(200);
    expect((await withCode()).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/mfa/setup")
          .auth(token, { type: "bearer" })
          .send({ current: password })
      ).status,
    ).toBe(409);
  });
  it("provides health and rejects anonymous records", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    expect((await request(app).get("/api/v1/employees")).status).toBe(401);
  });
  it("rejects bad credentials", async () =>
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: "employee@example.test", password: "wrong" })
      ).status,
    ).toBe(401));
  it("rotates refresh tokens and detects reuse", async () => {
    const first = await login("employee@example.test");
    const cookies = first.headers["set-cookie"] as unknown as string[];
    const refreshCookie = cookies
      .find((c) => c.startsWith("gh_refresh="))!
      .split(";")[0]!;
    const csrfCookie = cookies
      .find((c) => c.startsWith("gh_csrf="))!
      .split(";")[0]!;
    const csrf = decodeURIComponent(csrfCookie.slice(8));
    const rotated = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("x-csrf-token", csrf);
    expect(rotated.status).toBe(200);
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("x-csrf-token", csrf);
    expect(replay.status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/auth/me")
          .auth(rotated.body.data.accessToken, { type: "bearer" })
      ).status,
    ).toBe(401);
  });
  it("blocks cookie-authorized refresh without CSRF", async () => {
    const loginResponse = await login("employee@example.test");
    expect(
      (
        await request(app)
          .post("/api/v1/auth/refresh")
          .set("Cookie", loginResponse.headers["set-cookie"])
      ).status,
    ).toBe(403);
  });
  it("restricts an employee to their own record and blocks salary access", async () => {
    const rows = await request(app)
      .get("/api/v1/employees")
      .auth(employeeToken, { type: "bearer" });
    expect(rows.body.data.map((r: { _id: string }) => r._id)).toEqual([
      employeeId,
    ]);
    expect(
      (
        await request(app)
          .get("/api/v1/employees/" + otherEmployeeId)
          .auth(employeeToken, { type: "bearer" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get("/api/v1/employees/" + otherEmployeeId + "/salaries")
          .auth(employeeToken, { type: "bearer" })
      ).status,
    ).toBe(403);
  });
  it("restricts managers to explicitly assigned departments", async () => {
    expect(
      (
        await request(app)
          .get("/api/v1/employees")
          .auth(managerToken, { type: "bearer" })
      ).body.data,
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .get("/api/v1/employees/" + otherEmployeeId)
          .auth(managerToken, { type: "bearer" })
      ).status,
    ).toBe(404);
  });
  it("does not expose another employee payslip", async () => {
    const company = await m.Company.findOne();
    const payslip = await m.Payslip.create({
      companyId: company!.id,
      employeeId: otherEmployeeId,
      runId: new mongoose.Types.ObjectId(),
      itemId: new mongoose.Types.ObjectId(),
      releasedAt: new Date(),
    });
    expect(
      (
        await request(app)
          .get("/api/v1/payslips/" + payslip.id + "/pdf")
          .auth(employeeToken, { type: "bearer" })
      ).status,
    ).toBe(404);
  });
});
describe("leave and payroll workflows", () => {
  it("imports timestamped CSV atomically and rejects duplicates or invalid rows", async () => {
    const importRows = (csv: string) =>
      request(app)
        .post("/api/v1/attendance/import")
        .auth(adminToken, { type: "bearer" })
        .send({ csv, reason: "Fictional biometric CSV fixture" });
    const csv =
      "employeeNumber,clockIn,clockOut\nE1,2026-09-01T08:00:00+08:00,2026-09-01T17:00:00+08:00";
    expect((await importRows(csv)).status).toBe(201);
    expect((await importRows(csv)).status).toBe(409);
    const count = await m.AttendanceRecord.countDocuments();
    const invalid =
      "employeeNumber,clockIn,clockOut\nE1,2026-09-02T08:00:00+08:00,2026-09-02T17:00:00+08:00\nUNKNOWN,2026-09-02T08:00:00+08:00,2026-09-02T17:00:00+08:00";
    expect((await importRows(invalid)).status).toBe(422);
    expect(await m.AttendanceRecord.countDocuments()).toBe(count);
    expect(
      (
        await request(app)
          .post("/api/v1/attendance/import")
          .auth(employeeToken, { type: "bearer" })
          .send({ csv, reason: "Forbidden import" })
      ).status,
    ).toBe(403);
  });
  it("rejects a self-service request for another employee", async () => {
    const result = await request(app)
      .post("/api/v1/leave")
      .auth(employeeToken, { type: "bearer" })
      .send({
        employeeId: otherEmployeeId,
        leaveTypeId,
        startDate: "2026-10-11",
        endDate: "2026-10-11",
        units: 1,
        reason: "Forbidden cross-employee request",
      });
    expect(result.status).toBe(404);
  });
  it("approves leave once and posts an atomic balance debit", async () => {
    const created = await request(app)
      .post("/api/v1/leave")
      .auth(employeeToken, { type: "bearer" })
      .send({
        leaveTypeId,
        startDate: "2026-10-10",
        endDate: "2026-10-10",
        units: 1,
        reason: "Fictional leave test",
      });
    expect(created.status).toBe(201);
    const approve = () =>
      request(app)
        .post("/api/v1/leave/" + created.body.data._id + "/decision")
        .auth(managerToken, { type: "bearer" })
        .send({ decision: "Approved" });
    expect((await approve()).status).toBe(200);
    expect((await approve()).status).toBe(404);
    expect((await m.LeaveBalance.findOne({ employeeId }))?.units).toBe(4);
  });
  it("creates idempotent runs and prevents duplicate cutoffs", async () => {
    const create = (key: string) =>
      request(app)
        .post("/api/v1/payroll")
        .auth(adminToken, { type: "bearer" })
        .set("idempotency-key", key)
        .send({ periodId });
    const first = await create("fictional-key-123456");
    expect(first.status).toBe(201);
    runId = first.body.data._id;
    expect((await create("fictional-key-123456")).body.data._id).toBe(runId);
    expect((await create("fictional-other-123456")).status).toBe(409);
  });
  it("calculates actual salary snapshots and flags unverified policies", async () => {
    const response = await request(app)
      .post("/api/v1/payroll/" + runId + "/calculate")
      .auth(adminToken, { type: "bearer" })
      .send({ revision: 0 });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("Calculated");
    expect(response.body.data.gross).toBe("3000000");
    expect(response.body.data.exceptions).toContain("UNVERIFIED_SSS");
    expect(await m.PayrollItem.countDocuments({ runId })).toBe(2);
  });
  it("serializes employee records without encrypted confidential payloads", async () => {
    const employee = await m.Employee.findById(employeeId).select("+sensitive");
    employee!.sensitive = encrypt(
      JSON.stringify({ bankName: "Fictional Bank", bankAccount: "0000000001" }),
      config.FIELD_ENCRYPTION_KEY,
    );
    await employee!.save();
    expect(employee!.toJSON()).not.toHaveProperty("sensitive");
    const response = await request(app)
      .get("/api/v1/employees/" + employeeId)
      .auth(employeeToken, { type: "bearer" });
    expect(response.body.data).not.toHaveProperty("sensitive");
  });
  it("rejects stale revisions and enforces separate approval authority", async () => {
    const transition = (token: string, status: string, revision: number) =>
      request(app)
        .post("/api/v1/payroll/" + runId + "/transition")
        .auth(token, { type: "bearer" })
        .send({ status, revision, reason: "Fictional review test" });
    expect((await transition(adminToken, "Under Review", 0)).status).toBe(409);
    expect((await transition(adminToken, "Under Review", 1)).status).toBe(200);
    expect((await transition(adminToken, "Approved", 2)).status).toBe(403);
    expect((await transition(approverToken, "Approved", 2)).status).toBe(200);
    expect((await transition(approverToken, "Finalized", 3)).status).toBe(422);
    expect((await m.PayrollRun.findById(runId))?.status).toBe("Approved");
  });
  it("tests lifecycle finalization primitives using an explicitly cleared synthetic fixture gate", async () => {
    // Test-only fixture surgery: production routes have no way to clear the engine blocker.
    // This verifies transaction primitives, not statutory correctness or release readiness.
    await m.PayrollRun.updateOne({ _id: runId }, { $set: { exceptions: [] } });
    const finalize = () =>
      request(app)
        .post("/api/v1/payroll/" + runId + "/transition")
        .auth(approverToken, { type: "bearer" })
        .send({
          status: "Finalized",
          revision: 3,
          reason: "Synthetic lifecycle fixture only",
        });
    expect((await finalize()).status).toBe(200);
    expect((await finalize()).status).toBe(409);
    expect(await m.Payslip.countDocuments({ runId })).toBe(2);
    const before = await m.PayrollItem.find({ runId }).lean();
    expect(
      (
        await request(app)
          .post("/api/v1/payroll/" + runId + "/calculate")
          .auth(adminToken, { type: "bearer" })
          .send({ revision: 4 })
      ).status,
    ).toBe(409);
    expect(await m.PayrollItem.find({ runId }).lean()).toEqual(before);
  });
  it("releases a finalized fixture payslip and allows only its owner to download", async () => {
    const payslip = await m.Payslip.findOne({ runId, employeeId });
    expect(
      (
        await request(app)
          .get("/api/v1/payslips/" + payslip!.id + "/pdf")
          .auth(employeeToken, { type: "bearer" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/api/v1/payslips/" + payslip!.id + "/release")
          .auth(adminToken, { type: "bearer" })
          .send({})
      ).status,
    ).toBe(200);
    const pdf = await request(app)
      .get("/api/v1/payslips/" + payslip!.id + "/pdf")
      .auth(employeeToken, { type: "bearer" });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(
      (
        await request(app)
          .get("/api/v1/payslips/" + payslip!.id + "/pdf")
          .auth(managerToken, { type: "bearer" })
      ).status,
    ).toBe(403);
  });
  it("blocks late timekeeping inputs in finalized periods", async () => {
    const csv =
      "employeeNumber,clockIn,clockOut\nE1,2026-10-08T08:00:00+08:00,2026-10-08T17:00:00+08:00";
    expect(
      (
        await request(app)
          .post("/api/v1/attendance/import")
          .auth(adminToken, { type: "bearer" })
          .send({ csv, reason: "Locked period test" })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/v1/leave")
          .auth(employeeToken, { type: "bearer" })
          .send({
            leaveTypeId,
            startDate: "2026-10-08",
            endDate: "2026-10-08",
            units: 1,
            reason: "Locked period test",
          })
      ).status,
    ).toBe(409);
  });
  it("prevents duplicate payout instructions and reconciles once", async () => {
    const other =
      await m.Employee.findById(otherEmployeeId).select("+sensitive");
    other!.sensitive = encrypt(
      JSON.stringify({ bankName: "Fictional Bank", bankAccount: "0000000002" }),
      config.FIELD_ENCRYPTION_KEY,
    );
    await other!.save();
    const create = () =>
      request(app)
        .post("/api/v1/payments")
        .auth(adminToken, { type: "bearer" })
        .send({ runId });
    const response = await create();
    expect(response.status).toBe(201);
    const batchId = response.body.data._id;
    expect((await create()).status).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/v1/payments/" + batchId + "/approve")
          .auth(adminToken, { type: "bearer" })
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/payments/" + batchId + "/approve")
          .auth(approverToken, { type: "bearer" })
          .send({})
      ).status,
    ).toBe(200);
    const exportBatch = () =>
      request(app)
        .post("/api/v1/payments/" + batchId + "/export")
        .auth(adminToken, { type: "bearer" })
        .send({});
    expect((await exportBatch()).status).toBe(200);
    expect((await exportBatch()).status).toBe(409);
    const reconcile = () =>
      request(app)
        .post("/api/v1/payments/" + batchId + "/reconcile")
        .auth(approverToken, { type: "bearer" })
        .send({ reference: "Fictional bank acknowledgement" });
    expect((await reconcile()).status).toBe(200);
    expect((await reconcile()).status).toBe(409);
    expect((await m.PayrollRun.findById(runId))?.status).toBe("Paid");
  });
  it("allows only one concurrent submission revision", async () => {
    const company = await m.Company.findOne(),
      user = await m.User.findOne({ email: "admin@example.test" });
    const period = await m.PayrollPeriod.create({
      companyId: company!.id,
      name: "Concurrency fixture",
      startDate: "2026-11-01",
      endDate: "2026-11-15",
      payDate: "2026-11-20",
      periodUnits: 15,
      salaryDivisor: 2,
    });
    const run = await m.PayrollRun.create({
      companyId: company!.id,
      periodId: period.id,
      runNumber: "GH-CONCURRENT-TEST",
      preparedBy: user!.id,
      idempotencyKey: "concurrent-fixture-only",
      status: "Calculated",
      revision: 0,
    });
    const submit = () =>
      request(app)
        .post("/api/v1/payroll/" + run.id + "/transition")
        .auth(adminToken, { type: "bearer" })
        .send({
          status: "Under Review",
          revision: 0,
          reason: "Concurrent submission test",
        });
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

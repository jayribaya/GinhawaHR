import "dotenv/config";
import mongoose from "mongoose";
import argon2 from "argon2";
import { readConfig } from "./config/env.js";
import {
  Company,
  Role,
  User,
  Department,
  Branch,
  Position,
  Employee,
  SalaryHistory,
  LeaveType,
  LeaveBalance,
  PayrollPeriod,
} from "./infrastructure/models.js";
import { defaults } from "./modules/roles/policy.js";
const config = readConfig();
if (config.NODE_ENV === "production")
  throw new Error("Fictional seeding is disabled in production");
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error(
    "Set SEED_PASSWORD to a unique password of at least 12 characters",
  );
await mongoose.connect(config.MONGODB_URI);
if (await User.exists({})) throw new Error("Seed requires an empty database");
await mongoose.connection.transaction(async (session) => {
  const [company] = await Company.create(
    [
      {
        name: "Ginhawa Demo Company",
        address: "Fictional training organization, Philippines",
      },
    ],
    { session, ordered: true },
  );
  const companyId = company!.id;
  const roles = await Role.create(
    Object.entries(defaults).map(([name, definition]) => ({
      companyId,
      name,
      ...definition,
    })),
    { session, ordered: true },
  );
  const departments = await Department.create(
    ["People Operations", "Engineering", "Customer Success"].map((name, i) => ({
      companyId,
      name,
      code: "DEP-" + (i + 1),
    })),
    { session, ordered: true },
  );
  const [branch] = await Branch.create(
    [{ companyId, name: "Manila Office", code: "MNL" }],
    { session, ordered: true },
  );
  const [position] = await Position.create(
    [{ companyId, name: "Specialist", code: "SPEC" }],
    { session, ordered: true },
  );
  const employees = await Employee.create(
    [
      {
        companyId,
        employeeNumber: "GH-0001",
        firstName: "Alex",
        lastName: "Santos",
        email: "alex@example.test",
        departmentId: departments[0]!.id,
        branchId: branch!.id,
        positionId: position!.id,
        status: "Active",
        hireDate: "2024-01-15",
      },
      {
        companyId,
        employeeNumber: "GH-0002",
        firstName: "Sam",
        lastName: "Reyes",
        email: "sam@example.test",
        departmentId: departments[1]!.id,
        branchId: branch!.id,
        positionId: position!.id,
        status: "Active",
        hireDate: "2024-03-01",
      },
    ],
    { session, ordered: true },
  );
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const [admin] = await User.create(
    [
      {
        companyId,
        email: process.env.SEED_EMAIL ?? "admin@example.test",
        name: "Demo Administrator",
        passwordHash,
        roleId: roles.find((r) => r.name === "Super Administrator")!.id,
      },
    ],
    { session, ordered: true },
  );
  await User.create(
    [
      {
        companyId,
        email: "alex@example.test",
        name: "Alex Santos",
        passwordHash,
        roleId: roles.find((r) => r.name === "Employee")!.id,
        employeeId: employees[0]!.id,
      },
      {
        companyId,
        email: "approver@example.test",
        name: "Demo Approver",
        passwordHash,
        roleId: roles.find((r) => r.name === "Payroll Approver")!.id,
      },
    ],
    { session, ordered: true },
  );
  await SalaryHistory.create(
    employees.map((employee, i) => ({
      companyId,
      employeeId: employee.id,
      departmentId: employee.departmentId,
      amount: i === 0 ? "3500000" : "4500000",
      basis: "monthly",
      effectiveDate: "2024-01-01",
      reason: "Fictional seed salary",
      actorId: admin!.id,
    })),
    { session, ordered: true },
  );
  const [leaveType] = await LeaveType.create(
    [
      {
        companyId,
        name: "Company Leave (demo policy)",
        paid: true,
        annualUnits: 10,
        effectiveFrom: "2024-01-01",
        verified: false,
      },
    ],
    { session, ordered: true },
  );
  await LeaveBalance.create(
    employees.map((e) => ({
      companyId,
      employeeId: e.id,
      departmentId: e.departmentId,
      leaveTypeId: leaveType!.id,
      units: 10,
    })),
    { session, ordered: true },
  );
  await PayrollPeriod.create(
    [
      {
        companyId,
        name: "October 2026 — First half",
        startDate: "2026-10-01",
        endDate: "2026-10-15",
        payDate: "2026-10-20",
        periodUnits: 15,
        salaryDivisor: 2,
      },
    ],
    { session, ordered: true },
  );
});
console.log("Fictional company seeded. No statutory rates installed.");
await mongoose.disconnect();

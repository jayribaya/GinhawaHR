import mongoose, { Schema } from "mongoose";
const ref = (name: string, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
const money = { type: String, match: /^-?\d+$/, default: "0" };
const company = { companyId: ref("Company") };
const employee = {
  ...company,
  employeeId: ref("Employee"),
  departmentId: ref("Department", false),
};
const options = { timestamps: true, optimisticConcurrency: true };
export const Company = mongoose.model(
  "Company",
  new Schema(
    {
      name: { type: String, required: true },
      address: String,
      timezone: { type: String, default: "Asia/Manila" },
      currency: { type: String, default: "PHP" },
    },
    options,
  ),
);
export const Role = mongoose.model(
  "Role",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      permissions: [String],
      scope: {
        type: String,
        enum: ["company", "department", "self"],
        required: true,
      },
    },
    options,
  ).index({ companyId: 1, name: 1 }, { unique: true }),
);
export const User = mongoose.model(
  "User",
  new Schema(
    {
      ...company,
      email: { type: String, required: true, lowercase: true },
      name: { type: String, required: true },
      passwordHash: { type: String, select: false },
      roleId: ref("Role"),
      employeeId: ref("Employee", false),
      departmentIds: [{ type: Schema.Types.ObjectId, ref: "Department" }],
      active: { type: Boolean, default: true },
      mfaSecret: { type: String, select: false },
      mfaEnabled: { type: Boolean, default: false },
      mfaLastStep: { type: Number, select: false },
      mustChangePassword: { type: Boolean, default: false },
    },
    options,
  )
    .index({ email: 1 }, { unique: true })
    .index(
      { companyId: 1, employeeId: 1 },
      {
        unique: true,
        partialFilterExpression: { employeeId: { $type: "objectId" } },
      },
    ),
);
export const Session = mongoose.model(
  "Session",
  new Schema(
    {
      userId: ref("User"),
      tokenHash: { type: String, required: true },
      family: { type: String, required: true },
      csrfHash: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      lastUsedAt: { type: Date, required: true },
      revokedAt: Date,
      userAgent: String,
    },
    options,
  )
    .index({ tokenHash: 1 }, { unique: true })
    .index({ expiresAt: 1 }, { expireAfterSeconds: 86400 }),
);
export const AuthToken = mongoose.model(
  "AuthToken",
  new Schema(
    {
      userId: ref("User"),
      hash: { type: String, required: true },
      purpose: { type: String, enum: ["invitation", "reset"], required: true },
      expiresAt: { type: Date, required: true },
      usedAt: Date,
    },
    options,
  )
    .index({ hash: 1 }, { unique: true })
    .index({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
);
const organizationSchema = () =>
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      code: { type: String, required: true },
      managerId: ref("Employee", false),
      active: { type: Boolean, default: true },
    },
    options,
  ).index({ companyId: 1, code: 1 }, { unique: true });
export const Department = mongoose.model("Department", organizationSchema());
export const Branch = mongoose.model("Branch", organizationSchema());
export const Position = mongoose.model("Position", organizationSchema());
export const Employee = mongoose.model(
  "Employee",
  new Schema(
    {
      ...company,
      employeeNumber: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
      address: String,
      departmentId: ref("Department"),
      branchId: ref("Branch"),
      positionId: ref("Position", false),
      managerId: ref("Employee", false),
      status: {
        type: String,
        enum: [
          "Draft",
          "Active",
          "On Leave",
          "Suspended",
          "Separated",
          "Archived",
        ],
        default: "Draft",
      },
      classification: { type: String, default: "Regular" },
      hireDate: { type: Date, required: true },
      regularizationDate: Date,
      separationDate: Date,
      emergencyContact: String,
      sensitive: { type: String, select: false },
      bankLast4: String,
    },
    options,
  )
    .index({ companyId: 1, employeeNumber: 1 }, { unique: true })
    .index({ companyId: 1, departmentId: 1, status: 1 }),
);
Employee.schema.set("toJSON", {
  transform: (_doc, result) => {
    delete result.sensitive;
    return result;
  },
});
export const EmploymentHistory = mongoose.model(
  "EmploymentHistory",
  new Schema(
    {
      ...employee,
      effectiveDate: { type: Date, required: true },
      status: String,
      branchId: ref("Branch", false),
      positionId: ref("Position", false),
      reason: { type: String, required: true },
      actorId: ref("User"),
    },
    options,
  ),
);
export const SalaryHistory = mongoose.model(
  "SalaryHistory",
  new Schema(
    {
      ...employee,
      effectiveDate: { type: Date, required: true },
      amount: money,
      basis: {
        type: String,
        enum: ["monthly", "semi-monthly", "daily", "hourly"],
        required: true,
      },
      reason: { type: String, required: true },
      actorId: ref("User"),
    },
    options,
  ).index({ companyId: 1, employeeId: 1, effectiveDate: 1 }, { unique: true }),
);
export const Schedule = mongoose.model(
  "Schedule",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      startMinute: { type: Number, required: true },
      endMinute: { type: Number, required: true },
      breakMinutes: { type: Number, default: 60 },
      workdays: [Number],
      effectiveFrom: { type: Date, required: true },
    },
    options,
  ),
);
export const ScheduleAssignment = mongoose.model(
  "ScheduleAssignment",
  new Schema(
    {
      ...employee,
      scheduleId: ref("Schedule"),
      effectiveFrom: { type: Date, required: true },
      effectiveTo: Date,
    },
    options,
  ),
);
export const AttendanceRecord = mongoose.model(
  "AttendanceRecord",
  new Schema(
    {
      ...employee,
      day: { type: String, required: true },
      clockIn: { type: Date, required: true },
      clockOut: Date,
      workedMinutes: { type: Number, default: 0 },
      source: {
        type: String,
        enum: ["clock", "csv", "adjustment"],
        default: "clock",
      },
      lockedRunId: ref("PayrollRun", false),
    },
    options,
  ).index({ companyId: 1, employeeId: 1, day: 1 }, { unique: true }),
);
export const AttendanceAdjustment = mongoose.model(
  "AttendanceAdjustment",
  new Schema(
    {
      ...employee,
      attendanceId: ref("AttendanceRecord"),
      clockIn: { type: Date, required: true },
      clockOut: { type: Date, required: true },
      reason: { type: String, required: true },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      requestedBy: ref("User"),
      approvedBy: ref("User", false),
    },
    options,
  ),
);
export const LeaveType = mongoose.model(
  "LeaveType",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      paid: { type: Boolean, default: true },
      annualUnits: { type: Number, default: 0 },
      effectiveFrom: { type: Date, required: true },
      verified: { type: Boolean, default: false },
    },
    options,
  ),
);
export const LeaveBalance = mongoose.model(
  "LeaveBalance",
  new Schema(
    {
      ...employee,
      leaveTypeId: ref("LeaveType"),
      units: { type: Number, default: 0 },
    },
    options,
  ).index({ companyId: 1, employeeId: 1, leaveTypeId: 1 }, { unique: true }),
);
export const LeaveTransaction = mongoose.model(
  "LeaveTransaction",
  new Schema(
    {
      ...employee,
      leaveTypeId: ref("LeaveType"),
      units: { type: Number, required: true },
      reason: { type: String, required: true },
      requestId: ref("LeaveRequest", false),
      actorId: ref("User"),
    },
    options,
  ),
);
export const LeaveRequest = mongoose.model(
  "LeaveRequest",
  new Schema(
    {
      ...employee,
      leaveTypeId: ref("LeaveType"),
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      units: { type: Number, required: true },
      reason: { type: String, required: true },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      requestedBy: ref("User"),
      approvedBy: ref("User", false),
    },
    options,
  ),
);
export const OvertimeRequest = mongoose.model(
  "OvertimeRequest",
  new Schema(
    {
      ...employee,
      day: { type: String, required: true },
      minutes: { type: Number, required: true },
      reason: { type: String, required: true },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      requestedBy: ref("User"),
      approvedBy: ref("User", false),
    },
    options,
  ),
);
export const Holiday = mongoose.model(
  "Holiday",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      day: { type: String, required: true },
      kind: {
        type: String,
        enum: ["regular", "special", "company"],
        required: true,
      },
      source: { type: String, required: true },
    },
    options,
  ).index({ companyId: 1, day: 1 }, { unique: true }),
);
export const PayItem = mongoose.model(
  "PayItem",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      kind: { type: String, enum: ["earning", "deduction"], required: true },
      taxable: { type: Boolean, default: true },
      contributionRelevant: { type: Boolean, default: true },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
export const Loan = mongoose.model(
  "Loan",
  new Schema(
    {
      ...employee,
      name: { type: String, required: true },
      principal: money,
      balance: money,
      installment: money,
      status: {
        type: String,
        enum: ["Active", "Completed", "Cancelled"],
        default: "Active",
      },
      effectiveFrom: { type: Date, required: true },
    },
    options,
  ),
);
export const Repayment = mongoose.model(
  "Repayment",
  new Schema(
    {
      ...employee,
      loanId: ref("Loan"),
      runId: ref("PayrollRun"),
      amount: money,
    },
    options,
  ).index({ loanId: 1, runId: 1 }, { unique: true }),
);
export const PayrollPeriod = mongoose.model(
  "PayrollPeriod",
  new Schema(
    {
      ...company,
      name: { type: String, required: true },
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      payDate: { type: String, required: true },
      periodUnits: { type: Number, required: true },
      salaryDivisor: { type: Number, required: true },
      status: { type: String, enum: ["Open", "Locked"], default: "Open" },
    },
    options,
  ).index({ companyId: 1, startDate: 1, endDate: 1 }, { unique: true }),
);
export const StatutoryRuleVersion = mongoose.model(
  "StatutoryRuleVersion",
  new Schema(
    {
      ...company,
      kind: {
        type: String,
        enum: ["SSS", "PhilHealth", "PagIBIG", "BIR"],
        required: true,
      },
      version: { type: String, required: true },
      effectiveFrom: { type: String, required: true },
      effectiveTo: String,
      verified: { type: Boolean, default: false },
      source: { type: String, required: true },
      reviewedBy: ref("User", false),
      policy: { type: Schema.Types.Mixed, required: true },
    },
    options,
  ).index({ companyId: 1, kind: 1, version: 1 }, { unique: true }),
);
export const PayrollRun = mongoose.model(
  "PayrollRun",
  new Schema(
    {
      ...company,
      runNumber: { type: String, required: true },
      periodId: ref("PayrollPeriod"),
      status: {
        type: String,
        enum: [
          "Draft",
          "Calculated",
          "Under Review",
          "Approved",
          "Finalized",
          "Paid",
          "Rejected",
          "Corrected",
        ],
        default: "Draft",
      },
      preparedBy: ref("User"),
      approvedBy: ref("User", false),
      finalizedBy: ref("User", false),
      finalizedAt: Date,
      idempotencyKey: { type: String, required: true },
      revision: { type: Number, default: 0 },
      gross: money,
      net: money,
      exceptions: [String],
      reason: String,
      policySnapshot: { type: Schema.Types.Mixed },
      periodSnapshot: { type: Schema.Types.Mixed },
    },
    options,
  )
    .index({ companyId: 1, periodId: 1 }, { unique: true })
    .index({ companyId: 1, idempotencyKey: 1 }, { unique: true }),
);
export const PayrollItem = mongoose.model(
  "PayrollItem",
  new Schema(
    {
      ...employee,
      runId: ref("PayrollRun"),
      snapshot: { type: Schema.Types.Mixed, required: true },
      result: { type: Schema.Types.Mixed, required: true },
    },
    options,
  ).index({ runId: 1, employeeId: 1 }, { unique: true }),
);
export const PayrollAdjustment = mongoose.model(
  "PayrollAdjustment",
  new Schema(
    {
      ...employee,
      originalRunId: ref("PayrollRun"),
      amount: money,
      reason: { type: String, required: true },
      approvedBy: ref("User"),
    },
    options,
  ),
);
export const Payslip = mongoose.model(
  "Payslip",
  new Schema(
    {
      ...employee,
      runId: ref("PayrollRun"),
      itemId: ref("PayrollItem"),
      releasedAt: Date,
      releasedBy: ref("User", false),
    },
    options,
  ).index({ runId: 1, employeeId: 1 }, { unique: true }),
);
export const PaymentBatch = mongoose.model(
  "PaymentBatch",
  new Schema(
    {
      ...company,
      runId: ref("PayrollRun"),
      status: {
        type: String,
        enum: ["Prepared", "Approved", "Exported", "Reconciled"],
        default: "Prepared",
      },
      createdBy: ref("User"),
      approvedBy: ref("User", false),
      exportedAt: Date,
      reconciledAt: Date,
      reference: String,
    },
    options,
  ).index({ companyId: 1, runId: 1 }, { unique: true }),
);
export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      ...company,
      userId: ref("User"),
      title: { type: String, required: true },
      link: String,
      readAt: Date,
    },
    options,
  ),
);
export const AuditLog = mongoose.model(
  "AuditLog",
  new Schema({
    ...company,
    actorId: ref("User", false),
    action: { type: String, required: true },
    subject: String,
    correlationId: { type: String, required: true },
    summary: String,
    reason: String,
    createdAt: { type: Date, default: Date.now, immutable: true },
  }).index({ companyId: 1, createdAt: -1 }),
);
export const Setting = mongoose.model(
  "Setting",
  new Schema(
    {
      ...company,
      key: { type: String, required: true },
      version: { type: Number, required: true },
      value: { type: Schema.Types.Mixed, required: true },
      reason: { type: String, required: true },
      reviewedBy: ref("User", false),
    },
    options,
  ).index({ companyId: 1, key: 1, version: 1 }, { unique: true }),
);

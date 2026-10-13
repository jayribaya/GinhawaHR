# Collections and relationships

Every business record has companyId. An employee belongs to a department and branch and may reference a position and reporting employee. A user references a role and optionally an employee. Session and single-use token records reference the user.

```mermaid
erDiagram
 Company ||--o{ Department : owns
 Company ||--o{ Branch : owns
 Company ||--o{ Position : owns
 Company ||--o{ Role : defines
 Role ||--o{ User : authorizes
 User ||--o{ Session : authenticates
 User ||--o{ AuthToken : redeems
 Department ||--o{ Employee : assigns
 Branch ||--o{ Employee : locates
 Position ||--o{ Employee : classifies
 Employee ||--o{ EmploymentHistory : tracks
 Employee ||--o{ SalaryHistory : compensates
 Employee ||--o{ ScheduleAssignment : schedules
 Schedule ||--o{ ScheduleAssignment : configures
 Employee ||--o{ AttendanceRecord : clocks
 AttendanceRecord ||--o{ AttendanceAdjustment : corrects
 Employee ||--o{ LeaveBalance : holds
 LeaveType ||--o{ LeaveBalance : defines
 Employee ||--o{ LeaveRequest : applies
 LeaveType ||--o{ LeaveRequest : categorizes
 LeaveRequest ||--o{ LeaveTransaction : debits
 Employee ||--o{ OvertimeRequest : requests
 Employee ||--o{ Loan : borrows
 Loan ||--o{ Repayment : repays
 PayrollPeriod ||--o| PayrollRun : processes
 PayrollRun ||--o{ PayrollItem : snapshots
 Employee ||--o{ PayrollItem : receives
 PayrollRun ||--o{ Payslip : produces
 PayrollItem ||--o| Payslip : documents
 PayrollRun ||--o| PaymentBatch : disburses
 PayrollRun ||--o{ Repayment : applies
 PayrollRun ||--o{ PayrollAdjustment : references
 Company ||--o{ StatutoryRuleVersion : versions
 Company ||--o{ PayItem : configures
 Company ||--o{ Holiday : observes
 Company ||--o{ Setting : versions
 User ||--o{ Notification : receives
 User ||--o{ AuditLog : acts
```

References are ObjectIds, not database foreign keys. Services check company ownership and resource scope before protected writes. Not all cross-reference constraints are yet covered (see TODO). Indexes are declared in `server/src/infrastructure/models.ts`. Transactions require a replica set. Session/token expiry indexes do not replace application expiry checks. Financial values are decimal strings representing integer centavos; salary and payroll snapshots retain inputs and policy versions.

Application routes provide no audit update/delete endpoint. This alone is not tamper-proof storage: production must use a narrowly scoped database identity and an independent backup/audit retention process. Archival uses the employee Archived state; full configurable retention/anonymization remains unimplemented. Never choose a statutory retention period without a reviewed company policy.

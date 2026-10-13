# Authorization

Default role definitions and permission keys live in `server/src/modules/roles/policy.ts` and are seeded as editable database records. Authorization is enforced on the backend, including ObjectId routes. Unauthorized out-of-scope resources return a generic 404; forbidden operations return a generic 403.

- Super Administrator: all defined permission keys, company scope. Cannot approve/finalize payroll they prepared.
- HR Administrator: employee, organization, attendance, leave, overtime and user permissions, company scope. Inviting or changing user roles additionally requires roles.write.
- Payroll Administrator: authorized salary/configuration read/write, payroll preparation, loan administration, payslip release, payment preparation, reports and statutory uploads. No payroll approval/finalization permission.
- Payroll Approver: payroll approval and finalization, payment approval and reports. Cannot approve the batch they created or payroll they prepared.
- Department Manager: employee/time/leave/overtime reads and approvals for explicitly assigned departmentIds. No compensation or company-wide payroll access.
- Employee: restricted employee records, own time/leave/overtime requests and released payslips. Company payroll run endpoints are denied even when payroll.read is present.
- Auditor: employee records, payroll, reports, audit and statutory reads. No salary-history write or payroll preparation.

Company scope always includes companyId. Department scope resolves employees from current authorized department assignments; historical authorization policy requires further design. Self scope resolves the linked employeeId. Request bodies cannot override companyId, actorId, approval identity or status for sensitive transitions. There are no wildcard permissions.

Scope is a single role attribute in this increment. Future changes must test role conflicts, assignment changes, separation of duties, self-approval and access to historical records. Role editing, disabled permission keys and company-admin recovery require additional controls.

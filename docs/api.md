# Implemented API

Prefix `/api/v1`. Success `{data, meta?}`; errors `{error:{code,message,correlationId}}`. Authentication is `Authorization: Bearer <accessToken>`. No access token is persisted in browser storage. GET lists generally cap at 100; employee directory has page/limit/q/status. Swagger at `/api/v1/docs` and OpenAPI at `/api/v1/openapi.json` document collection reads, write payloads and workflow actions. More precise endpoint-specific response schemas and query/header definitions remain outstanding.

## Authentication

- POST `/auth/login`: email, password, optional totp; returns accessToken and refresh/CSRF cookies.
- POST `/auth/refresh`: refresh cookie, exact Origin and x-csrf-token; rotates cookie, returns accessToken.
- POST `/auth/logout`: same origin/CSRF; revokes family.
- POST `/auth/forgot-password`: email; neutral response, provider delivery pending.
- POST `/auth/reset-password`: token, password (12–128 characters); invitation tokens also redeem here.
- GET `/auth/me`, GET `/auth/sessions`, DELETE `/auth/sessions/:id`.
- POST `/auth/change-password`: current, password; POST `/auth/mfa/setup`: current password; POST `/auth/mfa/enable`: code. Existing enabled MFA cannot be replaced through setup.

## People and organization

- GET/POST `/employees`; GET/PUT `/employees/:id`. Create/update: employeeNumber, firstName, lastName, email, departmentId, branchId, hireDate, reason; optional status/classification/contact/address/emergencyContact/positionId/managerId/employment dates. Optional sensitive object: sss, philhealth, pagibig, tin, bankName, bankAccount. Unknown keys rejected.
- GET `/employees/:id/history`; GET/POST `/employees/:id/salaries`: amount (integer centavo string), basis, effectiveDate, reason.
- GET/POST `/departments`, `/branches`, `/positions`: name, code, active. PUT `/:id` supported for these resources.
- GET/PUT `/company`: name, address.
- GET/POST `/roles`: name, scope, permissions; no role update endpoint yet.
- GET `/users`; POST `/users/invite`: name, email, roleId, optional employeeId/departmentIds. PATCH `/users/:id/access`: roleId, active, departmentIds. Both writes also require roles.write.
- POST `/users/:id/reset-token`: users.write and company scope; returns a one-use reset token for secure manual delivery. Automatic email delivery is not configured.

## Time and leave

- GET `/attendance` with from/to ISO-date filters. POST `/attendance/clock`: action in/out; account must link an Active employee.
- POST `/attendance/import`: csv, reason; company scope required. Strict CSV headers employeeNumber,clockIn,clockOut; timestamp offsets required; at most 1,000 rows and 900 KB. Writes are atomic; duplicate employee-days, unknown employees and locked periods are rejected. Generic import only, no specific device integration.
- GET/POST `/attendance/adjustments`: attendanceId, clockIn/clockOut (UTC ISO), reason. POST `/attendance/adjustments/:id/decision`: decision Approved/Rejected.
- GET/POST `/schedules`: name, startMinute, endMinute, breakMinutes, workdays, effectiveFrom.
- POST `/schedule-assignments`: employeeId, scheduleId, effectiveFrom, optional effectiveTo.
- GET/POST `/holidays`: name, day, kind, source.
- GET/POST `/leave-types`: name, paid, annualUnits, effectiveFrom, optional verified.
- GET/POST `/leave`: leaveTypeId, startDate, endDate, units, reason, optional employeeId; self default. GET `/leave/balances/list`; POST `/leave/balances/adjust`: employeeId, leaveTypeId, units, reason.
- GET/POST `/overtime`: day, minutes, reason, optional employeeId. POST `/leave/:id/decision` and `/overtime/:id/decision`: decision Approved/Rejected. Requester cannot approve their own request.

## Financial workflows

- GET/POST `/pay-items`: name, kind earning/deduction, taxable, contributionRelevant, active.
- GET/POST `/payroll-periods`: name, startDate, endDate, payDate, periodUnits, salaryDivisor.
- GET/POST `/statutory`: kind, version, effectiveFrom, optional effectiveTo, source URL, policy. Policy supports baseCeiling, employeeBps, employerBps or brackets `{lower,upper,fixed,rateBps}`. All uploads stay unverified. No production verification route.
- GET/POST `/payroll`; POST requires periodId and Idempotency-Key (16–100 characters). GET `/payroll/:id` returns run and snapshot items.
- POST `/payroll/:id/calculate`: revision. POST `/payroll/:id/transition`: status Under Review/Approved/Rejected/Finalized, revision, reason. Finalization is blocked pending complete statutory engine.
- GET `/payslips`; POST `/payslips/:id/release`; GET `/payslips/:id/pdf` generates from server snapshots. Self scope requires releasedAt.
- GET/POST `/loans`: employeeId, name, principal, installment, effectiveFrom, reason. GET `/loans/:id/repayments`.
- GET/POST `/payments`: runId; finalized run required. POST `/payments/:id/approve`, `/export`, `/reconcile` (reference). Export changes state once and sends generic payout CSV; no bank transfer.
- GET `/reports/payroll`: optional from/to, format=csv; GET `/reports/payroll/:id/items`. GET `/audit`.
- GET/POST `/settings`: key, version, value (flat JSON object), reason; append-only versions.
- GET `/notifications`; PATCH `/notifications/:id/read`: empty object.
- GET `/health`: status only, 503 if database unavailable.

No unsupported endpoints are documented as implemented. Import/export breadth, configurable reports and detailed OpenAPI schemas remain in TODO.md.

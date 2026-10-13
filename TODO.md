# Release status — incomplete

GinhawaHR has a working foundation and connected HR/payroll preview flows. It is **not** the complete production product requested. Do not use this increment for real payroll finalization.

## Blocking financial requirements

- [ ] Implement reviewed official SSS salary-credit, employer EC/MPF tables and contribution-frequency bases.
- [ ] Implement complete PhilHealth and Pag-IBIG bases/floors/ceilings and official effective-date validation.
- [ ] Implement BIR withholding methods, annualization, exemptions, prior-employer/YTD inputs and year-end reconciliation.
- [ ] Implement reviewed 13th-month rules and report.
- [ ] Implement time/schedule/holiday/rest-day/night-differential/overtime policies and unpaid leave allocations.
- [ ] Implement partial-period, effective salary segmentation, retroactive increases and termination calculations.
- [ ] Implement approved employee pay-item allocations and configurable earnings/deductions.
- [ ] Add dual-control policy review, signed source evidence and complete official fixture tests; remove universal engine blocker only after all gates pass.
- [ ] Full finalization/concurrency/immutability tests, input locking/revalidation, traceable reversal/correction ledger, insufficient-net loan handling.

## Functional completeness

- [ ] Full per-module repository/model/DTO/policy layering; models currently centralized.
- [ ] Expand basic lifecycle transition checks into full onboarding/offboarding policy; organization assignment history, document storage and restricted access, import/export.
- [ ] Add sensitive field/profile bank-detail edit forms and compensation access audit.
- [ ] Complete organization editing/archive interfaces, reporting lines and schedule assignment UI.
- [ ] Break tracking, weekly/monthly/calendar views and overnight payroll allocation (CSV import is implemented).
- [ ] Leave accrual/service policies, overlap prevention, policy review, calendar/history (balance and attendance-adjustment approval UIs are implemented).
- [ ] Add self-service profile, payroll history/overtime status navigation and all specified pages.
- [ ] Add loan amortization schedules, reversal/completion administration and repayment UI.
- [ ] Configurable bank CSV/XLSX templates and controlled re-export/reconciliation recovery.
- [ ] All requested reporting views, filters, CSV/XLSX/PDF exports and contribution summaries.
- [ ] Dashboard financial trend/date filters/cutoff/upcoming dates and authorized recent activity.
- [ ] Role updates/recovery and permission catalog (user invitation/access and administrator-issued password recovery UI are implemented).
- [ ] Company/logo/pay calendar/approval/retention/localization/preferences settings UI.
- [ ] More precise OpenAPI response schemas and query/header definitions (write schemas and workflow endpoints are documented).
- [ ] Consistent pagination for all list endpoints; current non-directory lists cap at 100.
- [ ] Reusable toasts/confirmations and broader accessibility verification (global employee search handoff and basic states are implemented).

## Security and operations

- [ ] Provider-backed reset/invitation email delivery, token delivery audit, account activity and login/security alerts.
- [ ] MFA recovery codes, step-up admin actions and mandatory admin policy (enrollment UI and login-code replay prevention are implemented).
- [ ] Account-aware stuffing mitigation, broader timing analysis and shared rate-limit storage (unknown accounts use dummy Argon2 verification).
- [x] Clear React Query data on expiration/account switch; preserve current-account rotation; discard prior-account responses; four executed client-state tests.
- [ ] Enforce scope for every administrative write even for custom roles; test hostile role combinations.
- [ ] Validate all company references and department assignments consistently.
- [ ] Transactional audit writes for every mutating business/security operation; safe before/after summaries.
- [ ] DB-level append-only audit controls, key rotation/versioning, retention/anonymization procedures.
- [ ] Versioned reviewed financial settings actually consumed by computation.
- [ ] Security review, dependency scans, load/accessibility tests, restore drill and deployment smoke tests.

Validation outcomes are recorded in README.md; unexecuted or skipped tests must never be treated as passing.

# GinhawaHR

**People First. Payroll Made Easy.**

Philippine-focused HR and payroll modular monolith: React/TypeScript/Vite frontend, Express/TypeScript API, MongoDB/Mongoose, JWT access tokens and rotating HttpOnly refresh cookies.

## Status

This is an initial functional implementation, **not a production-complete HR/payroll product**. Employee records, organization setup, attendance clock events/corrections, leave/overtime decisions, salary versions, payroll preview/review, loans, protected payslip endpoints, payment workflows, register exports and notifications are wired to real MongoDB APIs. No statutory rates are invented or seeded. Payroll production finalization is blocked until the full statutory/timekeeping engine and professional review are complete.

See [TODO.md](TODO.md) for all outstanding requirements and [implementation plan](docs/implementation-plan.md) for phase status.

For a disposable preview with fictional data, run `npm run demo` and open `http://127.0.0.1:5173`. Login: admin@example.test / E2E_Fictional_Only_123!. The demo creates temporary data and discards it on restart; use the configured Atlas/development database for persistent records.

## Run locally

```sh
npm ci
# Copy .env.example to .env and set independent secrets, database URI and seed password.
docker compose -f docker/compose.yml up -d
npm run seed
npm run dev
```

Open `http://localhost:5173`. Seed is development-only and requires an empty database. Fictional accounts: configured SEED_EMAIL (default admin@example.test), alex@example.test, approver@example.test; all use the supplied SEED_PASSWORD. Never reuse that password outside development. MongoDB must support transactions (replica set/Atlas).

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Documentation

- [Architecture](docs/architecture.md) · [ERD](docs/erd.md) · [API](docs/api.md)
- [Permissions](docs/rbac-matrix.md) · [Payroll rules and source review](docs/payroll-calculation-rules.md)
- [Security](docs/security.md) · [Deployment](docs/deployment.md)

Financial and labor-policy applicability, official effective-dated tables, privacy/retention and government-report formats require professional review. Exports do not constitute certified government filing or actual bank transfer.

## Validation

Executed on 13 October 2026:

- ESLint, strict client/server typechecks and client/server production builds pass.
- 36 Vitest tests pass, using a real temporary MongoDB replica set for API/transaction tests and separate exact-arithmetic/cache-isolation tests.
- Five Chromium Playwright flows pass: recovery/navigation, admin employee creation, employee-only visibility, dark/mobile UI, payroll preparation and independent approval with blocked finalization.
- Final `npm audit --json` reports zero known vulnerabilities after upgrading the test runner.

The positive finalization/payment primitive tests explicitly clear the statutory gate in an isolated synthetic fixture. They do not establish Philippine payroll compliance. Normal application runs remain blocked. Docker/Azure/VPS deployment and a backup restore drill have not been executed on this workstation.

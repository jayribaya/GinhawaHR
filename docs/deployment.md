# Development and deployment

Prerequisites: Node 24 LTS or a supported later Node version, npm, MongoDB replica set or Atlas. Docker Desktop is optional for local MongoDB. The development compose file binds MongoDB only to loopback and is unauthenticated; never expose it publicly.

1. `npm ci`.
2. Copy `.env.example` to `.env` and provide actual random JWT_SECRET, 64-hex FIELD_ENCRYPTION_KEY, MongoDB URI and APP_ORIGIN. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` generates one key; generate independent values.
3. `docker compose -f docker/compose.yml up -d` or use an Atlas replica set. Local compose advertises localhost for host-run Express; for containerized Express, use a replica set advertising the internal service name instead.
4. Set a unique SEED_PASSWORD (12+ characters), then `npm run seed` on an empty development database only. Seed creates fictional employee records, an admin, an employee and an independent approver. It refuses production or a database containing users. No government rates are seeded.
5. `npm run dev` and open `http://localhost:5173`. Use exactly the configured APP_ORIGIN for refresh CSRF checks. Backend defaults to port 4000.
6. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. E2E: `npx playwright install chromium`, `npm run test:e2e`. Browser tests start their own isolated, fictional replica-set database and API; they do not require an Atlas account or a seed against a persistent database. Port 4000 must be free.

For a disposable local preview, `npm run demo` starts an ephemeral replica-set database and seeded API plus Vite at `http://127.0.0.1:5173`. Fictional admin login: admin@example.test / E2E_Fictional_Only_123!. This intentionally public test password is only for the disposable loopback demo. Stopping/restarting the demo discards all records. Use the configured persistent development/Atlas deployment for real application storage.

## Production build

`docker build -f docker/Dockerfile -t ginhawahr .` builds the client and server. The runtime runs as non-root and has a database-aware health probe. Inject secrets at runtime. No secrets belong in image layers, source or committed env files. Production requires HTTPS APP_ORIGIN; TLS termination occurs at App Service or a trusted reverse proxy. Set only one known proxy hop or adjust trust proxy to verified infrastructure.

For Azure App Service: push image to your private registry, configure port 4000, always-on, HTTPS-only and the health endpoint, set environment secrets using Key Vault references where supported, restrict Atlas network access and use a least-privilege database account. Validate transaction support. This increment has not been deployed to Azure.

For Linux VPS: use Docker behind an HTTPS reverse proxy (Caddy/nginx), bind application port to loopback, open only HTTPS/SSH as needed, deny public MongoDB ingress, restrict registry/network credentials and rotate secrets. Use a production MongoDB deployment with authentication, TLS and replica-set support; the development compose is not a production topology.

## Operations

Enable encrypted Atlas backups or a reviewed replica-set-aware backup process. Keep backups in restricted encrypted storage separate from runtime credentials. Test restoration into an isolated environment, verify collection/index counts, decrypt a controlled fictional record with the appropriate key version, reconcile payroll snapshots and confirm audit continuity. Backup encryption keys separately with strict access; without the field key sensitive values cannot be recovered. Never perform restoration over a live database without an approved recovery plan.

Monitor health, database connectivity, response error rates, latency, disk/database limits, failed logins, session replay, unusual exports and missing audit writes. Logs should contain correlation IDs and safe operation metadata only. Add centralized error monitoring without request bodies/tokens or raw identifiers. No observability provider is wired in this increment.

**Release is blocked** by the statutory engine and remaining security/functional items in TODO.md. The existence of Docker files or a successful build does not make this implementation production-ready.

# Deployment Guide

## Environment variables (envalid-validated at startup)

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `NODE_ENV` | — | development | development \| test \| production |
| `PORT` | — | 3000 | HTTP port |
| `CORS_ORIGIN` | — | * | tighten in production |
| `APP_URL` | — | http://localhost:3000 | public base URL (payment checkout links) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | yes | localhost/5432 | PostgreSQL; `DB_USER` must be a **non-superuser** role in prod (see below) |
| `DB_POOL_MAX` | — | 10 | connection pool size |
| `JWT_SECRET` | yes | — | use a long random value |
| `JWT_EXPIRES_IN` | — | 15m | access-token TTL |
| `REFRESH_TOKEN_TTL_DAYS` / `INVITE_TTL_DAYS` | — | 30 / 7 | |
| `REDIS_HOST/PORT` | — | localhost/6379 | |
| `REDIS_PASSWORD` | — | (empty) | empty = no auth |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | — | 900000 / 100 | per-IP `/api` limit |
| `SEPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET` | yes (billing) | dev defaults | per-provider HMAC secrets — set real values in prod |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS` | — | 300 | Stripe signature freshness window |
| `LOG_LEVEL` | — | info | |
| `SWAGGER_ENABLED` | — | true | set false to hide `/api-docs` in prod |
| `METRICS_ENABLED` | — | true | set false / gate `/metrics` internally |
| `OTEL_ENABLED` | — | false | enable OpenTelemetry tracing |

The app **fails fast** at startup if a required var is missing or malformed.

## Local infrastructure
```bash
docker compose up -d        # Postgres 18.4 + Redis 8.8.0 (reads .env)
```
`docker-compose.yml` substitutes `${DB_*}` / `${REDIS_*}` from `.env`. `POSTGRES_PASSWORD` only applies on first volume creation — change it ⇒ `docker compose down -v` to reset.

## Build & run (production)
```bash
pnpm install --prod=false
pnpm build                  # tsc + tsc-alias → dist/
pnpm migration:run          # apply migrations (never synchronize)
node dist/index.js          # or: pnpm start
pnpm worker                 # separate process for background jobs
```

## Database role & RLS (production-critical)

Tenant isolation's second layer is Postgres Row-Level Security (see
[ADR 0002](adr/0002-postgres-rls.md)). **RLS does not apply to superusers or roles
with `BYPASSRLS`.** If the app connects as a superuser (the default on many
managed Postgres instances and in local dev), Layer-2 is silently off and only
the application filter protects tenants. In production the app **must** connect
as a dedicated non-superuser, non-`BYPASSRLS` role.

Run migrations as the owner/admin role (they issue DDL), but point the app's
`DB_USER` at a least-privilege role:

```sql
-- Once, as the DB owner/admin:
CREATE ROLE booking_app LOGIN PASSWORD '<strong-secret>' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE <db> TO booking_app;
GRANT USAGE ON SCHEMA public TO booking_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO booking_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO booking_app;
-- so future migrations' tables are reachable without re-granting:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO booking_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO booking_app;
```

Tenant tables use `FORCE ROW LEVEL SECURITY`, so even the table owner is subject
to the policy — but a superuser still bypasses it, which is why `booking_app` is
`NOSUPERUSER`. Verify after deploy: connect as `booking_app`, `SET app.tenant_id`
to one tenant, and confirm a query returns only that tenant's rows.
(`test/integration/rls-isolation.e2e.spec.ts` and `subscription-rls.e2e.spec.ts`
prove the policies enforce under a non-superuser role.)

## Docker

Multi-stage `Dockerfile` (build with full deps → slim non-root runtime). All deps are pure-JS, so no native build toolchain is needed in the image.

```bash
docker build -t express-typestack .
# full stack (app + postgres + redis) via compose:
docker compose --profile full up -d        # app is behind the "full" profile
docker compose up -d                        # plain: only postgres + redis (dev)
```
The `app` compose service reads `.env` and overrides `DB_HOST=postgres` / `REDIS_HOST=redis` for the compose network.

## Live demo deploy (managed platform)

Steps for a PaaS with managed Postgres + Redis (Railway, Render, Fly.io — the
specifics differ but the shape is the same). Two processes run from one image:
the web server and the BullMQ worker.

1. **Provision** a managed Postgres (18) and Redis, and note their connection
   details. Create the non-superuser `booking_app` role above; use it for
   `DB_USER`/`DB_PASSWORD`.
2. **Set environment** on the service: `NODE_ENV=production`, the DB/Redis vars,
   a strong `JWT_SECRET`, real `SEPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET`,
   `APP_URL=https://<your-domain>`, `CORS_ORIGIN=https://<your-frontend>`, and
   `SWAGGER_ENABLED`/`METRICS_ENABLED` as desired (gate `/metrics` behind the
   platform's private network).
3. **Build:** `pnpm install --prod=false && pnpm build`.
4. **Release / pre-deploy step (run once per deploy, as the admin role):**
   `pnpm migration:run`. Keep this separate from the app process so migrations
   run under the owner while the app runs as `booking_app`.
5. **Web process:** `node dist/index.js` — bind `PORT` (most PaaS inject it).
   Point the platform health check at `GET /health/ready`.
6. **Worker process:** `pnpm worker` as a second service/process from the same
   image (it consumes the outbox + email queue; without it, jobs never drain).
7. **Verify:** `/health/ready` is 200, `POST /api/v1/auth/register` works, and
   the RLS smoke check from the section above passes as `booking_app`.

A single-container fallback (web only) works for a pure API demo, but background
delivery (emails, signed webhooks) needs the worker running too.

## CI

`.github/workflows/ci.yml` runs on push to `main`/`develop` and on PRs: install → lint → typecheck → unit tests → build → integration tests (testcontainers; Docker is preinstalled on GitHub runners). DB/JWT env vars are injected as dummies for envalid.

## Migrations
- Generate after entity changes: `pnpm migration:gen` (needs a reachable DB).
- Apply: `pnpm migration:run`. Revert: `pnpm migration:revert`.
- `synchronize` is always `false` — schema changes go through migrations.

## Health & monitoring (for orchestrators)
- **Liveness:** `GET /health/live` — process up.
- **Readiness:** `GET /health/ready` — 200 when Postgres + Redis reachable, else 503.
- **Metrics:** `GET /metrics` — Prometheus scrape target.
- **Graceful shutdown:** SIGTERM/SIGINT → terminus drains connections, closes DataSource + Redis, then exits (set a generous `terminationGracePeriodSeconds` in k8s).

## CI checklist
Docker is required for integration tests (testcontainers). Run in order:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build
```

## Unresolved / future
- Refresh-token flow is out of scope (only short-lived access tokens).
- `/api-docs` and `/metrics` exposure in production should be gated (env flags provided) behind internal network or auth.

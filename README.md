# booking-platform-api

![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24_LTS-5FA04E?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-1.0-FE0803?logo=typeorm&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-8-FF4438?logo=redis&logoColor=white)
![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Traces-425CC7?logo=opentelemetry&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-Testcontainers-C21325?logo=jest&logoColor=white)
![Biome](https://img.shields.io/badge/Biome-Lint_+_Format-60A5FA?logo=biome&logoColor=white)

[![CI](https://github.com/ndgkhoa/booking-platform-api/actions/workflows/ci.yml/badge.svg)](https://github.com/ndgkhoa/booking-platform-api/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ndgkhoa/booking-platform-api?sort=semver&label=release&color=orange)](https://github.com/ndgkhoa/booking-platform-api/releases)
[![codecov](https://codecov.io/gh/ndgkhoa/booking-platform-api/graph/badge.svg)](https://codecov.io/gh/ndgkhoa/booking-platform-api)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

Multi-tenant **booking SaaS backend** in Express — tenant isolation enforced by Postgres row-level security, double-booking made physically impossible by a GiST exclusion constraint, idempotent APIs, a transactional outbox relaying to BullMQ, subscription billing with HMAC-signed webhooks, and OpenTelemetry tracing.

## Highlights

- **Multi-tenant isolation, enforced in the database.** Every tenant-scoped table
  runs Postgres RLS with `FORCE`; the app connects as a non-superuser role and
  pins each request to its tenant via `SET LOCAL app.tenant_id`. A missing tenant
  context fails closed (zero rows), not open.
- **No double-booking, proven under load.** A `EXCLUDE USING gist` constraint on
  `bookings` makes overlapping slots for the same staff physically impossible —
  not app-level locking. Verified with k6 (50 concurrent identical bookings → one
  `201`, forty-nine clean `409`s) and a deterministic e2e test.
- **Exactly-once side effects.** Idempotency keys guard client retries; a
  transactional outbox relays domain events to BullMQ so emails/webhooks fire
  once, even across crashes.
- **Billing & signed webhooks.** Subscriptions with plan entitlement limits;
  SePay/Stripe webhooks verified by HMAC signature with replay tolerance.
- **Production-grade ops.** RFC 7807 error envelopes, Prometheus `/metrics`,
  OpenTelemetry traces, terminus health probes, Dockerized, CI/CD to GHCR.

## Stack

| Concern | Library |
|---------|---------|
| HTTP / routing | Express 4 + routing-controllers |
| DI | TypeDI |
| ORM / migrations | TypeORM + PostgreSQL |
| Validation / serialization | class-validator + class-transformer |
| Auth | passport-jwt + jsonwebtoken + bcryptjs (+ Google OAuth) |
| Config | dotenv + envalid |
| Logging | winston + morgan |
| API docs | routing-controllers-openapi + swagger-ui-express |
| Cache / jobs | ioredis + BullMQ |
| Monitoring | prom-client + @godaddy/terminus + OpenTelemetry |
| Testing | jest + supertest + testcontainers + k6 |
| Lint / format | Biome + husky + lint-staged |
| Dev / build | @swc-node + node --watch (dev) + tsc + tsc-alias (build) |

## Quick start

```bash
pnpm install
cp .env.example .env          # then fill in secrets
docker compose up -d          # Postgres 18.4 + Redis 8.8.0
pnpm migration:run            # create schema (incl. RLS policies)
pnpm seed:up                  # admin@example.com / Abc@123456 + demo data
pnpm dev                      # http://localhost:3000
```

- API base: `http://localhost:<PORT>/api/v1`
- Swagger UI: `http://localhost:<PORT>/api-docs`
- Health: `/health/ready` (readiness), `/health/live` (liveness)
- Metrics: `/metrics` (Prometheus)
- Background worker: `pnpm worker`
- API client collection: [`bruno/`](./bruno) (open with [Bruno](https://www.usebruno.com))
- Full stack in Docker: `docker compose --profile full up -d` (api + Postgres + Redis)

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Hot-reload dev server (@swc-node + node --watch) |
| `pnpm build` / `pnpm start` | Compile to `dist/` / run compiled |
| `pnpm worker` | Run the BullMQ worker process |
| `pnpm test` / `pnpm test:int` | Unit / integration (testcontainers) tests |
| `pnpm test:cov` | Full suite with coverage (used by CI) |
| `pnpm typecheck` | Type-check src + tests (no emit) |
| `pnpm lint` / `pnpm lint:fix` | Biome lint/format |
| `pnpm migration:gen\|run\|revert` | TypeORM migrations |
| `pnpm seed:up` / `pnpm seed:down` | Seed / unseed the database |

## Concurrency guarantee

The flagship invariant — one staff member can never be double-booked for
overlapping times — is enforced by a Postgres `EXCLUDE USING gist` constraint on
`bookings`, not by application locking. SQLSTATE `23P01` maps to a `409`.

Proven empirically under real HTTP load: 50 virtual users POST the **same** staff
+ slot simultaneously; exactly one wins, every other gets a clean `409`. A `201`
is only returned after the row commits, so "one `201`" means "one row".

```
  █ THRESHOLDS
    booking_conflicts ✓ 'count==49' count=49
    bookings_created   ✓ 'count==1'  count=1
  █ TOTAL RESULTS
    checks_succeeded...: 100.00% 50 out of 50
    ✓ won (201) or lost cleanly (409)
    bookings_created...: 1     ← exactly one booking exists for the contested slot
    booking_conflicts..: 49
```

Reproduce: [`load-tests/`](./load-tests) (`k6 run load-tests/booking-double-booking.k6.js`).
The same guarantee is asserted deterministically in
`test/integration/booking-concurrency.e2e.spec.ts`.

## Multi-tenancy & RLS

Tenant isolation is defence-in-depth. Layer 1: an app-level filter driven by
`AsyncLocalStorage` request context. Layer 2: Postgres RLS with `FORCE` on every
tenant-scoped table, so even a raw query cannot cross tenants. RLS is inert for
superusers, so **production must run the app as a dedicated non-superuser,
non-`BYPASSRLS` role** — the app refuses to start otherwise (`src/index.ts`). The
integration suite mirrors this: it runs the real migrations against a Postgres
testcontainer and connects the app under test through a non-superuser role, so
RLS is exercised end-to-end.

## CI/CD

- **CI** (`ci.yml`): lint → typecheck → build → test (+coverage) on every PR and
  push to `main`, with results posted back as a sticky PR comment.
- **Release** (`release-please.yml`): [release-please](https://github.com/googleapis/release-please)
  derives the version from Conventional Commits, keeps an open release PR, and on
  merge tags `vX.Y.Z`, cuts a GitHub Release, and pushes the image to GHCR.
  Commits are linted (Conventional Commits, **required scope**) by a Husky
  `commit-msg` hook.

```bash
docker pull ghcr.io/ndgkhoa/booking-platform-api:latest
```

## Conventions

- **Path aliases** for all imports (`@config`, `@common`, `@modules`, `@database`,
  `@jobs`) — no relative `../../`.
- **Layering:** controller → service → **repository** (all DB access lives in
  `*.repository.ts`; services never touch QueryBuilder).
- **Structured responses:** success `{ success, data, meta? }`; errors are RFC 7807
  `application/problem+json` (`type, title, status, detail, instance, code,
  errors?, traceId?`).
- **Custom exceptions** extend routing-controllers `HttpError` with a stable
  `errorCode`.

## Documentation

See [`docs/`](./docs): [overview](./docs/project-overview-pdr.md) · [architecture](./docs/system-architecture.md) · [code standards](./docs/code-standards.md) · [codebase summary](./docs/codebase-summary.md) · [deployment](./docs/deployment-guide.md).

## License

[MIT](./LICENSE) © 2026 ndgkhoa

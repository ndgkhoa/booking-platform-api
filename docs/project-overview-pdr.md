# Project Overview — Multi-Tenant Booking SaaS API

## What
Production Express4 + TypeStack (routing-controllers + TypeDI + TypeORM) API for a multi-tenant booking platform. Core capability: prevent double-booking via Postgres EXCLUDE constraint; enforce tenant isolation via AsyncLocalStorage + RLS; support RBAC via per-tenant Membership; enable billing via pluggable PaymentProvider (SePay/Stripe). 22 modules: auth, user, membership, tenant, service, staff, staff-service, working-hours, time-off, availability, booking, recurrence, customer, outbox, webhook, reporting, plan, subscription, payment, admin, invite, and more.

## Why these choices
- **Postgres EXCLUDE USING gist** — one staff ≠ overlapping bookings, proven under real concurrency (k6 load test + integration tests).
- **Postgres RLS + AsyncLocalStorage** — defense-in-depth tenant isolation; Layer 1 (app filter) + Layer 2 (DB RLS FORCE).
- **Membership model** — role lives in `memberships(user_id, tenant_id, role)`, not on users; super_admin is a global flag.
- **Transactional outbox** — domain events relay reliably via Postgres; no lost webhooks.
- **PaymentProvider strategy** — swap SePay ↔ Stripe without touching booking logic.
- **routing-controllers + TypeDI** — declarative, injection-based; less boilerplate.
- **Repository layering** — all DB access in `*.repository.ts`; services stay unit-testable.

## Locked technical decisions
| Decision | Reason |
|----------|--------|
| Express **4** (not 5) | routing-controllers 0.11 incompatible with Express 5 routing |
| Build with **tsc** (dev/CLI **ts-node**), not tsx/tsup | esbuild does not emit `emitDecoratorMetadata` |
| **PostgreSQL 18** | EXCLUDE USING gist, RLS, testcontainers integration, migration history |
| **Repositories inject `DataSource`** (no `@InjectRepository`) | TypeORM 1.x dropped container integration |
| **Postgres per-request transaction + RLS** | Stronger than advisory locks; proven at scale |

## Scope
**In:** Multi-tenant SAAS (tenant isolation, RBAC, billing), booking with concurrency guarantees, notifications (transactional outbox), reporting, super-admin console, API docs, metrics, health checks, graceful shutdown, migrations, seeding, tests (unit + integration), lint/format/hooks.

**Out (intentional):** End-user-facing UI, email sending (worker queues only), SMS, push notifications, analytics (just raw event queues), legacy refresh-token flow.

## Success criteria
- Double-booking test: 50 concurrent requests to same staff+slot → exactly 1 succeeds (201), 49 get 409.
- Tenant isolation test: RLS blocks cross-tenant reads even with superuser pool connection (verified via SET ROLE).
- `pnpm dev` + `docker compose up -d` → healthy API + Swagger + metrics in <10s.
- `pnpm test && pnpm test:int` all green; coverage >80%.
- All RBAC checks enforce tenant membership (no leaks across tenants).

## Related docs
See [`docs/adr/`](./adr/) for locked architectural decisions (0001–0007): EXCLUDE, RLS, membership, outbox, timezone, money, payment-provider.

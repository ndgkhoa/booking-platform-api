# System Architecture

## Request flow & layers

```
HTTP request → Security middleware (helmet, cors, json, hpp, rate-limit, morgan→winston, metrics)
  │
  ▼
TenantContextMiddleware (before)
  ├─ Extract + verify Bearer token
  ├─ Open per-request transaction (tenant-scoped)
  ├─ SET LOCAL app.tenant_id → RLS gates all statements
  └─ Attach tokenClaims (tenantId, role)
  │
  ▼
routing-controllers dispatch + @Authorized
  ├─ authorizationChecker: passport-jwt + role (from tokenClaims)
  └─ currentUserChecker: return request.user
  │
  ▼
Controller (@JsonController /api/v1/...)
  ├─ Thin — DTO binding + validation only
  └─ No business logic, no DB access
  │
  ▼
Service (@Service)
  ├─ Business rules + domain logic
  ├─ Throws domain exceptions (AppException subclasses)
  └─ Injects own module's repositories
  │
  ▼
Repository (@Service)
  ├─ ALL TypeORM access (QueryBuilder, getRepository)
  ├─ BaseTenantRepository: runs on request-scoped tx
  └─ RLS enforces isolation for every query
  │
  ▼
PostgreSQL (Postgres 18 + RLS FORCE)
  └─ EXCLUDE USING gist guards against overlaps
```

## Response & error handling

**Success:** Controller returns data → **ResponseInterceptor** → `{ success: true, data, meta? }`.

**Errors:** Any throw → **ErrorHandler** (before routing response) → RFC 7807 `application/problem+json`:
```json
{
  "type": "https://example.com/errors/conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Staff already booked 3:00–4:00 PM on that day",
  "instance": "/api/v1/bookings",
  "code": "BOOKING_CONFLICT",
  "errors": [{ "field": "staffId", "messages": ["..." ] }],
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

## Tenant isolation (defense-in-depth)

**Layer 1 (Application):** AsyncLocalStorage tenantId extracted from token claims by TenantContextMiddleware; attached to request. BaseTenantRepository checks context before accessing DB.

**Layer 2 (Database):** Postgres RLS with `FORCE` policy + `SET LOCAL app.tenant_id` in per-request transaction. Fails closed: `current_setting('app.tenant_id', true)` is NULL if unset → no rows leak.

**Test enforcement:** Integration tests run REAL migrations on a Postgres testcontainer and create a dedicated non-superuser role (`app_rls_user`). The app under test connects through this role, so RLS is enforced end-to-end — matching production behavior. Superuser connection is used only for seeding/cleanup. Direct DB-layer proofs use `SET ROLE app_rls_user` in `rls-isolation.e2e.spec.ts` and `subscription-rls.e2e.spec.ts`.

**Production requirement:** Superusers and roles with `BYPASSRLS` bypass RLS silently. The app must connect as a non-superuser, non-`BYPASSRLS` role for RLS to take effect.

## Per-request transaction lifecycle

1. TenantContextMiddleware opens tx + `SET LOCAL app.tenant_id = ${tenantId}`
2. Request executes; services use repositories (all on same tx, RLS-gated)
3. TenantTransactionInterceptor commits BEFORE response is serialised
4. Commit failure → 500 (client sees the truth, not a lie)
5. On auth failure / validation error / 4xx/5xx → middleware's finish listener rolls back

## Concurrency guarantee — EXCLUDE UNIQUE constraint

The flagship invariant: one staff member cannot hold overlapping bookings. Enforced by Postgres EXCLUDE USING gist on `bookings`:

```sql
EXCLUDE USING gist (
  tenant_id WITH =,
  staff_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status IN ('pending', 'confirmed') AND deleted_at IS NULL)
```

Check + write are one atomic operation; no race window. Conflicting insert fails with SQLSTATE `23P01` → HTTP `409`. Proven under real load: k6 test with 50 concurrent requests to same staff+slot → exactly one `201`, 49 `409`s.

## Background jobs & transactional outbox

- Producer enqueues jobs to BullMQ (Redis-backed).
- Outbox relay: domain events written to `outbox` table in same transaction as the booking; separate worker pulls with `FOR UPDATE SKIP LOCKED`, publishes webhooks, marks as processed.
- Ensures events never lost even on crash (Postgres is source of truth; outbox is the inbox).
- Worker: `pnpm worker` (separate process, independent Redis connection).

## Observability

- **OpenTelemetry:** auto-instruments http/express/pg/ioredis; `@config/tracing` is the FIRST import in every entrypoint; gated by `OTEL_ENABLED`.
- **Metrics:** prom-client `/metrics` + per-request latency histogram.
- **Logging:** winston (dev pretty / prod JSON); `trace_id`/`span_id` on every line via `traceContext` format.
- **Health:** `/health/ready` (DB + Redis readiness), `/health/live` (liveness).
- **Graceful shutdown:** SIGINT/SIGTERM → closes DataSource + Redis + BullMQ queues before exit.

## Dependency Injection

- TypeDI is the container; `useContainer(Container)` wires routing-controllers.
- Controllers/services/repositories are `@Service()` — constructor-injected.
- `DataSource` registered at bootstrap; repositories inject it and call `getRepository(Entity)` (TypeORM 1.x dropped `@InjectRepository`).

## Build/runtime

Decorator metadata (`emitDecoratorMetadata`) required by TypeORM/TypeDI/routing-controllers. esbuild (tsx/tsup) does not emit it → dev/CLI use **ts-node**, build uses **tsc** + `tsc-alias` (resolve path aliases in `dist/`).

## Architecture Decisions

See [`docs/adr/`](./adr/) for the locked decisions:
- [0001 EXCLUDE over locking](./adr/0001-exclude-over-locking.md)
- [0002 Postgres RLS](./adr/0002-postgres-rls.md)
- [0003 Customer vs Membership](./adr/0003-tenant-model-customer-vs-membership.md)
- [0004 Transactional outbox](./adr/0004-transactional-outbox.md)
- [0005 UTC storage + timezone math](./adr/0005-timezone-utc-storage.md)
- [0006 Money as integer minor units](./adr/0006-money-integer-minor-units.md)
- [0007 Payment provider strategy](./adr/0007-payment-provider.md)

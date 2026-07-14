# Codebase Summary

## Directory tree

```
src/
  index.ts                      bootstrap: DataSource init → container + health checks → listen
  server.ts                     createServer(): middleware chain + routing-controllers + swagger
  worker.ts                     BullMQ worker (pnpm worker) + outbox relay
  config/
    env.ts                      envalid-validated config
    container.ts                TypeDI ↔ routing-controllers wiring
    logger.ts                   winston (pretty dev / JSON prod)
    data-source.ts              TypeORM DataSource + RLS setup
    redis.ts                    ioredis + shared options
    swagger.ts                  OpenAPI spec builder
    tracing.ts                  OpenTelemetry auto-instrumentation
  common/
    base/                       BaseEntity, BaseTenantEntity, BaseQuery (pagination)
    exceptions/                 AppException + HTTP exceptions (400/401/403/404/409/etc)
    interceptors/               ResponseInterceptor (success envelope), TenantTransactionInterceptor
    middlewares/                TenantContextMiddleware, ErrorHandler, HttpLogger, Metrics
    monitoring/                 prom-client registry + http latency histogram
    tenant/                     AsyncLocalStorage + runWithTenant helper
    types/                      ApiResponse, ApiError, ProblemDetails (RFC 7807), express.d.ts
    utils/                      Redis cache helpers (cache.ts, etc)
  modules/                      22 domain modules:
    auth/                       JWT strategy, token service, auth controller (register/login/switch-tenant)
    user/                       User entity, repository, service, controller (GET me, list)
    membership/                 Membership entity (user + tenant + role), RBAC checks
    tenant/                     Tenant entity + lifecycle (create/suspend/reactivate)
    service/                    Service entity (what can be booked), repository, service, controller
    staff/                      Staff entity (person in a tenant), availability computation
    staff-service/              StaffService junction (staff ↔ service N:M), controller
    working-hours/              WorkingHours entity (staff availability slots), controller
    time-off/                   TimeOff entity (staff unavailability), controller
    availability/               Availability engine (compute free slots), controller
    booking/                    Booking entity (EXCLUDE constraint, concurrency-safe), service, controller
    recurrence/                 Recurrence patterns (daily/weekly/monthly) for bookings
    customer/                   Customer entity (who gets booked), scoped per tenant
    admin/                       Super-admin console (list/suspend tenants, audit logs)
    invite/                     Tenant invites (email-based onboarding)
    outbox/                     Transactional outbox (domain events → webhooks)
    webhook/                    Webhook outbound + inbound signature verification
    reporting/                  Booking & revenue reports (tenant owner only)
    plan/                       Billing plan entity + list controller
    subscription/               Subscription entity (tenant → plan mapping), state machine
    payment/                    PaymentProvider strategy (SePay/Stripe), webhook receipts
  database/
    migrations/                 TypeORM migrations (schema, constraints, RLS policies)
    factories/                  faker-based test factories (User, Tenant, Booking, etc)
    seeds/                      seeders + db seed runner

test/
  unit/                         Unit tests (mocked repositories)
  integration/                  e2e tests with testcontainers (real Postgres + Redis)

bruno/                          REST client collection (Bruno format)
```

## Config files

- `tsconfig.json` — editor + type-check + ts-node/jest (src + test).
- `tsconfig.build.json` — emit only (src, excludes test) for `pnpm build`.
- `jest.config.js` / `jest.int.config.js` — unit / integration test runners.
- `biome.json` — single/2-space/width-100/trailing-commas/trailing-newline.
- `.lintstagedrc.json`, `.husky/` — pre-commit lint, pre-push test.
- `docker-compose.yml` — Postgres 18.4 + Redis 8.8.0 + optional `full` profile (includes api).

## Key endpoints (all under `/api/v1/`)

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/switch-tenant` | Onboarding + JWT |
| `GET /users/me`, `GET /users/:id` | Current user, user profile |
| `GET /tenants`, `POST /tenants` | List/create tenant (owner only) |
| `GET /bookings`, `POST /bookings`, `PATCH /bookings/:id` | CRUD bookings (concurrency-safe) |
| `GET /availability` | Compute free slots (availability engine) |
| `GET /plans` | Billing plan catalog |
| `GET /subscriptions/current`, `POST /subscriptions` | Subscription lifecycle |
| `GET /reports/bookings`, `GET /reports/revenue` | Tenant reporting (owner only) |
| `GET /admin/tenants` | Super-admin: list all tenants |
| `POST /payments/webhooks/:provider` | Inbound signed billing webhook (SePay/Stripe) |
| `GET /health/ready`, `GET /health/live` | Liveness + readiness probes |
| `GET /metrics` | Prometheus metrics |
| `GET /api-docs`, `GET /api-docs.json` | Swagger UI + OpenAPI spec

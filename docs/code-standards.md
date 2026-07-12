# Code Standards

## Imports — path aliases only
Use aliases; never relative `../../`.

| Alias | Path |
|-------|------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@common/*` | `src/common/*` |
| `@modules/*` | `src/modules/*` |
| `@database/*` | `src/database/*` |
| `@jobs/*` | `src/jobs/*` |

Resolved by tsconfig `paths` (dev via ts-node + tsconfig-paths; build via tsc-alias). Biome `organizeImports` sorts them.

## Layering (non-negotiable)
- **Controller** — routing + DTO binding only. No business logic, no DB.
- **Service** — business rules; throws domain exceptions; depends on repositories, never the ORM directly.
- **Repository** — the *only* place with `getRepository`/`QueryBuilder`. One per aggregate (`*.repository.ts`).

## Responses
Every success is enveloped by `ResponseInterceptor`: `{ success:true, data, meta? }`. Pre-enveloped payloads (e.g. `paginated()`) pass through untouched. Never hand-build success envelopes in controllers.

## Errors & exceptions (RFC 7807 Problem Details)
- Throw subclasses of `AppException` (extends routing-controllers `HttpError`) from `@common/exceptions` — `NotFound`, `Conflict`, `Unauthorized`, `Forbidden`, `Validation`, `BadRequest`.
- The global `ErrorHandler` renders `application/problem+json` per RFC 7807: standard members `type`, `title`, `status`, `detail`, `instance` plus documented extensions `code` (stable `errorCode`), `errors` (field-level validation `{ field, messages }`, never echoes submitted values), and `traceId` (active OTel trace). 500 detail is hidden in production. Built via `buildProblem()` in `@common/types/problem-details`.
- Success responses keep the `{ success, data, meta? }` envelope; only errors are problem+json.

## Observability — tracing
- `@config/tracing` (OpenTelemetry) is the FIRST import in every entrypoint so http/express/pg/ioredis auto-instrument. Env-gated by `OTEL_ENABLED` (off in dev/test/CI). `trace_id`/`span_id` are stamped on every log line by the winston `traceContext` format.

## Validation & serialization
- DTOs use class-validator decorators; global `validation: { whitelist, forbidNonWhitelisted }`.
- Sensitive entity fields use class-transformer `@Exclude` (e.g. `passwordHash`) — stripped from all responses.

## Files & naming (enforced — Biome `useNamingConvention` + review)
Consistency is a hard gate, not discretion. CI fails on deviation.

**Files** — kebab-case, descriptive, with a role suffix:
`*.controller.ts` `*.service.ts` `*.repository.ts` `*.entity.ts` `*.dto.ts` `*.guard.ts` `*.middleware.ts` `*.value-object.ts` `*.strategy.ts` `*.factory.ts` `*.queue.ts` `*.worker.ts`. One concern per file, target <200 lines.

**Identifiers**
| Kind | Case | Example |
|------|------|---------|
| Class / Enum / Type / Interface | `PascalCase` | `BookingService`, `BookingStatus` |
| Interface | `PascalCase`, **no `I` prefix** | `PaymentProvider` (not `IPaymentProvider`) |
| Method / variable / param | `camelCase` | `findAvailableSlots` |
| Constant / env | `SCREAMING_SNAKE_CASE` | `BCRYPT_ROUNDS` |
| Boolean | `is`/`has`/`can` prefix | `isConfirmed`, `canTransitionTo` |
| DB table | `snake_case`, plural | `bookings`, `working_hours` |
| DB column | `snake_case` | `starts_at`, `tenant_id` |

**Class name conventions by role** — `XController`, `XService`, `XRepository`, `X` (entity), `XException`, `XGuard`, `XStrategy`.

**DTO suffixes** — `CreateXDto`, `UpdateXDto`, `XResponseDto`, `x-query.dto.ts` (kebab-case, extends `BaseQuery`). DTO ≠ Entity: never leak entities out of controllers; map via response DTOs / `@Exclude`. Example: `availability-query.dto.ts`, `report-query.dto.ts`, `user-query.dto.ts`.

**Tests** — `test/unit/**/*.spec.ts` (unit), `test/integration/**/*.e2e.spec.ts` (integration). Names describe scenario, never plan/finding codes (`TestBooking_ConcurrentSameSlot`, not `_F3`).

## Architecture — Pragmatic Modular
Layered (controller→service→repository) as the default, with a **pure domain layer extracted only where complexity earns it** — not ports/adapters everywhere (avoid cargo-cult Clean Architecture).
- **Pure domain (framework-free, unit-tested in isolation):** availability engine, booking state machine, value objects (`Money`, `TimeRange`). No TypeORM/Express imports here.
- **Framework edge:** controllers (HTTP), repositories (TypeORM), queues (BullMQ), adapters (payment/webhook clients).
- **Dependency rule:** domain depends on nothing; services orchestrate domain + repositories; controllers depend on services.
- **Cross-module dependencies go through services, not repositories.** A service injects its OWN module's repositories, but reaches other modules only via their *service* (public API) — never their repository. Reaching into another module's repository bypasses that module's invariants and couples to its persistence. Example: `StaffServiceService` verifies a service via `ServiceService.getById`, not `ServiceRepository`.
- One module per aggregate under `@modules/*` — keep modules cohesive; split when a module accretes distinct concerns (e.g. `staff/` = profiles + capability, `schedule/` = working hours + time-off).

## Multi-tenant rules (non-negotiable)
- Tenant-scoped entities extend `BaseTenantEntity` (adds `tenant_id` + composite lead index). All uniques scoped: `UNIQUE(tenant_id, …)`. Every composite index leads with `tenant_id`.
- Tenant context via AsyncLocalStorage (Layer 1) + Postgres RLS (Layer 2). Repositories never accept a raw `tenant_id` param — it comes from context.
- Never write a query that could read another tenant's rows; RLS is the backstop, not the excuse.

### RLS execution model
- `TenantContextMiddleware` opens a per-request transaction for tenant-scoped tokens and pins it with `SET LOCAL app.tenant_id`; it commits on a 2xx/3xx response and rolls back on 4xx/5xx or abort (also giving request-wide write atomicity). `BaseTenantRepository` runs on this request-scoped manager so RLS gates every statement.
- RLS policies (`ENABLE`/`FORCE` + `tenant_isolation`) fail closed: `current_setting('app.tenant_id', true)` is NULL when unset → zero rows.
- **Caveat:** superusers and table owners with BYPASSRLS ignore RLS. Dev/test connect as a superuser, so Layer-1 (app filter) is the active guard there; RLS is proven at the DB layer in `rls-isolation.e2e` via `SET ROLE` to a non-superuser. **Production must run the app as a non-superuser role** for RLS to take effect.
- Global-lookup-by-secret tables (`invites`, `refresh_tokens`) use plain repositories (not `BaseTenantRepository`) and are intentionally NOT under RLS — the secret token is the capability.

## Design patterns
Catalogued with real call-sites in [`design-patterns.md`](./design-patterns.md). Patterns are used where they remove duplication or isolate change — never for show.

## Tooling
- **Biome** for lint + format (single quotes, 2-space, width 100, trailing commas). Parameter decorators enabled (`unsafeParameterDecoratorsEnabled`).
- Pre-commit: lint-staged runs Biome on staged files. Pre-push: `pnpm test`.
- Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm test` should all pass.

## Security defaults
helmet, CORS, rate-limit on `/api`, hpp, `x-powered-by` off, bcryptjs cost 12, short-lived JWT, generic auth errors (no user enumeration), `synchronize:false` (migrations only).

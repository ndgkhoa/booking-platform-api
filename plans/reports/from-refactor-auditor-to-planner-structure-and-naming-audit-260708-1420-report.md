# Structure & Naming Audit — booking-flow-api (`feature/multi-tenancy-core`)

Audience: planner. READ-ONLY audit. Scope: all `src/`, `test/`, `docs/code-standards.md`, ADRs.
Verdict up front: **this is already a strong, senior-level codebase.** Layering, DI, refresh-token rotation, RLS defense-in-depth, graceful shutdown, envalid config are all genuinely good. Findings below are polish + a few extensibility seams to lay now before Phases 2-10 (services/bookings/payments/webhooks). No architectural rewrite warranted. Rank by impact/effort at the end.

---

## 1. Folder structure

### Current shape (fact)
```
src/common/{base,exceptions,interceptors,middlewares,monitoring,tenant,types,utils}
src/config
src/database/{factories,migrations,seeds}
src/jobs/{queues,workers}
src/modules/{auth,tenant,user}
```

### Issues found

**I1 — Two "tenant" folders collide (real confusion).**
- `src/common/tenant/` = cross-cutting **infra**: `tenant-context.ts` (AsyncLocalStorage request context) + `tenant-transaction.ts` (Postgres RLS GUC transaction helper). Neither is domain code.
- `src/modules/tenant/` = the **domain** (Tenant entity, membership, roles, service).
- A reader importing `@modules/tenant/...` vs `@common/tenant/...` must hold both meanings. The `common/` one is not "tenant the aggregate" — it's "request context" + "db scoping". Naming should reflect that.

**I2 — `tenant-transaction.ts` is DB-layer infra sitting in a context folder.** It is about Postgres `set_config`/RLS, not about the async context. Different concern from `tenant-context.ts`; grouping them under one folder blurs "who owns DB scoping."

**I3 — `platform-role.enum.ts` placement is defensible but asymmetric.** It lives in `modules/user` (correct — the `platform_role` column is on `User`). But the *tenant* role enum lives in `modules/tenant/role.enum.ts`. Two authorization axes, two modules, two different file-name styles (`platform-role.enum.ts` vs bare `role.enum.ts`). Keep locations; fix the naming asymmetry (see §2).

**I4 — `common/base/query.base.ts` exports a pagination DTO, not a "query".** Minor: it's `BaseQuery` (page/limit validation). Fine to keep, but the name reads like CQRS.

**I5 — No home for tenant-scoped repository base / RLS runtime wiring.** Today `UserRepository` and `TenantMemberRepository` each hand-roll `getRepository` + `getTenantId()` + "throw if no context". Phases 2-10 add many tenant-owned aggregates that repeat this. There is no `common/persistence` seam. (Extensibility — §4.)

### Proposed TARGET tree (minimal churn)

```
src/
  common/
    base/                 base.entity.ts, base.query.ts        # renamed, §2
    context/              tenant-context.ts                    # was common/tenant/ (infra rename)
    persistence/          tenant-scoped-transaction.ts         # was common/tenant/tenant-transaction.ts
                          tenant-scoped.repository.ts (NEW)    # base for §4/§I5
                          postgres-error.ts (NEW)              # SQLSTATE map, §3 DRY
    exceptions/           (unchanged)
    interceptors/         (unchanged)
    middlewares/          (unchanged)
    monitoring/           (unchanged)
    types/                (unchanged)
    utils/                cache.ts, timeout.ts (unchanged)
  config/                 (unchanged)
  database/               (unchanged)
  jobs/                   (unchanged)
  modules/
    auth/                 + refresh-token.repository.ts (NEW, §3)
    tenant/               tenant-role.enum.ts (renamed, §2)
    user/                 (unchanged)
```

Rationale: rename `common/tenant` → split into `common/context` (async request context) and `common/persistence` (DB/RLS scoping). This kills the two-tenant-folder collision and gives Phase-2 booking/service repositories an obvious place for the shared tenant-scoped base + SQLSTATE mapping. Everything else stays put — churn is confined to 2 moved files + 3 new files.

Optional (Phase 2+, not now): `src/modules/admin/` for the `/admin` super-admin surface implied by `PlatformRole`. Don't create empty.

---

## 2. Naming consistency (top concern)

### The convention in play (inferred)
Stereotype-suffix, kebab-case: `<name>.<stereotype>.ts` where stereotype ∈ {entity, repository, service, controller, middleware, interceptor, strategy, enum, dto, factory, seeder, queue, worker, exception}. Class name = PascalCase of `<name><Stereotype>` (e.g. `tenant-member.repository.ts` → `TenantMemberRepository`). This is applied **well** across modules. The breaks are concentrated in `common/base` and the two enums.

### Inconsistencies (every one found)

| # | Problem | Detail |
|---|---------|--------|
| N1 | **Suffix order inverted in `base/`** | `entity.base.ts` / `query.base.ts` put the qualifier last. Class is `BaseEntity` (adjective-first). Everywhere else name-first, stereotype-last. These two invert it. |
| N2 | **`Role` enum name is ambiguous** | `modules/tenant/role.enum.ts` exports `enum Role`. It sits next to `PlatformRole`. Two role axes, one is unqualified — a reader sees `Role` and cannot tell it's the *tenant* role. High-value rename. |
| N3 | **`role.enum.ts` filename too generic** | Should mirror `platform-role.enum.ts`. |
| N4 | **Migration generic name** | `1780298127369-Migration.ts` → class `Migration1780298127369`. Non-descriptive; the second migration (`TenancyCore`) got it right. |
| N5 | **`jwt.strategy.ts` exports a function, not a Strategy class** | File exports `configurePassport()`; `.strategy.ts` implies a `class ...Strategy`. Mild. |
| N6 | **Untyped utility/helper files** | `tenant-context.ts`, `tenant-transaction.ts`, `cache.ts`, `timeout.ts`, `metrics.ts` carry no stereotype suffix. This is **acceptable and recommended** — they are function-module utilities, not stereotyped classes. Decision to make explicit in code-standards: *stereotyped classes get a suffix; plain function modules use a bare descriptive kebab name.* Do NOT force `.util.ts` onto them. |

### ONE unified convention (write into `docs/code-standards.md`)
1. Files whose primary export is a **stereotyped class** (entity/repository/service/controller/middleware/interceptor/DTO/exception/enum): `<name>.<stereotype>.ts`, stereotype **last**, class = `PascalCase(<name><Stereotype>)`.
2. Base/abstract stereotyped classes: `base.<stereotype>.ts` → class `Base<Stereotype>` (e.g. `base.entity.ts` → `BaseEntity`).
3. Plain function-module utilities (no class stereotype): bare descriptive kebab name, no suffix (`timeout.ts`, `cache.ts`, `tenant-context.ts`).
4. Enums that name an authorization/domain axis carry the **full axis name**: `tenant-role.enum.ts` → `TenantRole`, `platform-role.enum.ts` → `PlatformRole`.
5. Migrations: descriptive class name (`<Domain><timestamp>`), never bare `Migration`.

### RENAME TABLE

| Current path | Current symbol | → Proposed path | → Proposed symbol |
|---|---|---|---|
| `common/base/entity.base.ts` | `BaseEntity` | `common/base/base.entity.ts` | `BaseEntity` (unchanged) |
| `common/base/query.base.ts` | `BaseQuery` | `common/base/base.query.ts` | `BaseQuery` (unchanged) |
| `common/tenant/tenant-context.ts` | `TenantContext`, `runWithTenant`, … | `common/context/tenant-context.ts` | unchanged |
| `common/tenant/tenant-transaction.ts` | `withTenantTransaction` | `common/persistence/tenant-scoped-transaction.ts` | unchanged |
| `modules/tenant/role.enum.ts` | `enum Role` | `modules/tenant/tenant-role.enum.ts` | `enum TenantRole` |
| `database/migrations/1780298127369-Migration.ts` | `Migration1780298127369` | `…-initial-schema.ts` (keep ts-migration timestamp convention) | `InitialSchema1780298127369` |
| `modules/auth/jwt.strategy.ts` | `configurePassport` | keep OR `passport.config.ts` | `configurePassport` (rename optional) |

`TenantRole` rename touches: `role.enum.ts`, `tenant-member.entity.ts`, `tenant.service.ts`, `auth.service.ts`, `token.service.ts`, `tenant-context.ts`, `user.controller.ts`, `database/seeds/user.seeder.ts`, `test/integration/*`. Mechanical (find/replace `Role`→`TenantRole` + import path). ~10 files. Do it now while the blast radius is small — it only grows with each phase.

Update `@common` alias imports for the two moved folders (`@common/tenant/*` → `@common/context/*` and `@common/persistence/*`).

---

## 3. Code style & library usage

### Already good (keep)
- Clean Controller→Service→Repository layering; controllers are thin (routing + DTO only). ✔
- typedi DI consistent (`@Service()`), `useContainer(Container)` wired. ✔
- Refresh-token rotation: SHA-256-at-rest, family revocation on reuse, atomic `WHERE revoked_at IS NULL` claim to resolve the rotation race, family-revoke committed outside the txn. Genuinely senior. ✔
- Register is transactional + atomic; concurrent-email race mapped to 409 not 500. ✔
- RLS backstop + `app_user` role + `set_config(...true)` (SET LOCAL) — correct two-layer isolation. ✔
- Enveloped responses via interceptor, `@Exclude` on `passwordHash`, envalid config, terminus health/shutdown, live-role authorization (DB lookup per request so revocation is immediate). ✔

### Findings

**C1 (DRY, med impact/low effort) — PG-error logic duplicated.** `PG_UNIQUE_VIOLATION = '23505'` and the `isUniqueViolation` check exist in BOTH `error-handler.middleware.ts` and `auth.service.ts`. ADR-0002 adds `23P01` (exclusion) and the mapping will spread further. Extract `common/persistence/postgres-error.ts` with the SQLSTATE constants + `isUniqueViolation` / `isExclusionViolation` helpers. Do this before bookings land.

**C2 (layering, med) — services touch the ORM directly.** Code-standards §Layering says "Repository is the *only* place with `getRepository`/QueryBuilder." Violated in:
- `refresh-token.service.ts` — service IS the repository (`dataSource.getRepository`, `manager.getRepository`, inline `update`/`create`). No `RefreshTokenRepository` exists.
- `auth.service.ts:58` — `manager.getRepository(User)` inside the transaction.
- `tenant.service.ts:28-29` — `manager.getRepository(Tenant/TenantMember)`.

Nuance: transactional writes legitimately need the txn's `EntityManager`, and the standard doesn't say how repositories participate in a caller's transaction. Two honest options: (a) relax the rule to "raw SQL/QueryBuilder only in repositories; `manager.getRepository(X)` inside an explicit txn is allowed," or (b) give repositories manager-aware methods (`create(data, manager?)`). Recommend (a) for the transaction seams + extract a real `RefreshTokenRepository` for the non-txn reads (`findOne by hash`, `revokeFamily`). Pick one and document it — right now the rule reads as violated.

**C3 (low) — `TokenService.verifyAccess` casts without shape validation.** `jwt.verify(...) as AccessTokenPayload` trusts a validly-signed token to carry `sub/tenantId/role`. A token minted by an older/other signer with the same secret could miss fields. Low risk (single signer), but a runtime guard (or zod parse) on the decoded payload is cheap hardening.

**C4 (low) — double JWT verification per request.** `tenantContextMiddleware` calls `TokenService.verifyAccess`, then `authorizationChecker` runs passport-jwt which verifies again. Correct, but two verifies + the context is built from the token in the middleware while passport re-extracts. Acceptable; note for later consolidation.

**C5 (nit) — `ErrorHandler.error(error: any)`.** `any` at the framework boundary is pragmatic; `unknown` + narrowing is cleaner but low value.

**C6 (dead code, low) — welcome-email job never enqueued.** `enqueueWelcomeEmail` / `emailQueue` are defined and a worker consumes `EMAIL_QUEUE`, but nothing in `src` calls `enqueueWelcomeEmail` (grep: only its own definition). Either wire it into `register()` or mark it explicitly as scaffolding. Scaffolding that looks wired is a trap for the next dev.

**C7 (nit) — `authorizationChecker` manually promisifies `passport.authenticate`.** Works, but the nested-callback-in-Promise is awkward. Fine to leave.

---

## 4. Extensibility (Phases 2-10: services, bookings, payments, webhooks)

The "add a module = entity+repo+service+controller+DTO" pattern scales well. Lay these seams **now** to avoid per-aggregate copy-paste later:

**E1 (highest leverage) — `TenantScopedRepository` base.** Every tenant-owned aggregate (services, bookings, payments…) will repeat: read `getTenantId()`, throw if absent, scope every query to it. Today `TenantMemberRepository.findAllInTenant` and `UserRepository.*InTenant` hand-roll it. Add `common/persistence/tenant-scoped.repository.ts` providing `scopedQb()`/`getTenantIdOrThrow()` so booking/service repos inherit tenant scoping instead of re-deriving it. Biggest future-churn saver.

**E2 — RLS runtime wiring is not connected yet.** `withTenantTransaction` sets the `app.tenant_id` GUC, but the request path connects as the DB superuser (which bypasses RLS) and never sets the GUC — only the isolation *test* exercises `SET LOCAL ROLE app_user`. The migration comment says this lands "with the first tenant-owned business tables" (bookings). Plan a request-scoped `EntityManager` provider (connect as `app_user`, set GUC per request/txn) as an explicit Phase-2 task; otherwise booking queries silently run without the DB backstop. Structural, not urgent this phase, but must be scheduled.

**E3 — SQLSTATE mapping must generalize (ties to C1).** Error-handler hardcodes `23505` inline. ADR-0002 needs `23P01`→409. Centralize in `postgres-error.ts` now so booking concurrency just adds one entry.

**E4 — Idempotency infra (ADR-0002).** Bookings need `Idempotency-Key` storage. Anticipate `common/http/idempotency` (middleware + store). Don't build now; reserve the location so it doesn't get wedged into a module.

**E5 — `jobs/` will grow beyond email.** Current `queues/` + `workers/` split scales, but `EMAIL_QUEUE` string + job type live in `queues/email.queue.ts` and the worker imports them — good. Payments/webhooks will add queues; the pattern holds. No change needed, just confirm one-queue-per-file continues.

**E6 — `PlatformRole` / `/admin` surface.** `PlatformRole.SUPER_ADMIN` exists on `User` and is seeded, but there is no `/admin` controller or authorization path consuming it yet. When it arrives, put it in `modules/admin/`, not bolted onto `user`. Note as a forward dependency.

---

## Priority ranking (impact / effort)

| Pri | Change | Impact | Effort | When |
|-----|--------|--------|--------|------|
| P0 | N2/N3 `Role`→`TenantRole` + `tenant-role.enum.ts` | High (ambiguity grows every phase) | Low (~10 files, mechanical) | Now |
| P0 | E1 `TenantScopedRepository` base | High (kills per-aggregate copy-paste) | Med | Now / early Phase 2 |
| P1 | I1/I2 split `common/tenant`→`common/context`+`common/persistence` | Med (removes name collision) | Low (2 moves + alias) | Now |
| P1 | C1/E3 extract `postgres-error.ts` | Med (DRY, unblocks 23P01) | Low | Now |
| P1 | N1 `base.entity.ts`/`base.query.ts` order | Med (convention integrity) | Low | Now |
| P2 | C2 resolve service-vs-repository ORM access (+ `RefreshTokenRepository`) + document rule | Med | Med | This phase |
| P2 | E2 RLS runtime wiring plan | High (security backstop) | Med-High | Scheduled Phase 2 |
| P3 | N4 rename first migration class | Low | Low | Now (before more migrations reference it) |
| P3 | C6 wire or annotate welcome-email | Low | Low | Now |
| P3 | C3 `verifyAccess` payload guard | Low | Low | Opportunistic |
| P4 | N5 `jwt.strategy.ts`, C4/C5/C7 nits | Low | Low | Optional |
| P4 | E4 idempotency / E6 admin module locations | — | — | Reserve for later phase |

---

## Unresolved questions

1. **C2 direction** — relax the "repository-only ORM" rule to allow `manager.getRepository(X)` inside explicit transactions (option a), or push manager-aware methods into repositories (option b)? Needs a call before Phase 2 write paths multiply.
2. **N4 migration rename** — is the first migration already applied in any shared/staging DB? If TypeORM's `migrations` table has recorded `Migration1780298127369`, renaming the class requires care (it keys by class name). Safe on a fresh DB; confirm before renaming.
3. **E2 timing** — should RLS runtime wiring (connect-as-`app_user` + per-request GUC) be a hard gate for the first booking table, or ship app-layer-only first? Security vs delivery trade-off for the user to decide.
4. **jwt.strategy.ts rename** — leave as-is (function that configures passport) or rename to `passport.config.ts`? Cosmetic; user preference.

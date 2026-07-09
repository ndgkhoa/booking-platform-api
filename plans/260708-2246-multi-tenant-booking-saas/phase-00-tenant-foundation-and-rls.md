# Phase 00 — Tenant Foundation & RLS

## Context Links
- Overview: [plan.md](plan.md)
- Existing: `src/common/base/entity.base.ts`, `src/config/data-source.ts:15`, `src/server.ts:28,36-49`, `src/modules/user/user.entity.ts`, `src/modules/user/user.repository.ts`

## Overview
- **Priority:** P1 (blocks everything)
- **Status:** ✅ Done
- **Description:** Establish tenant context propagation (AsyncLocalStorage), `BaseTenantEntity`/`BaseTenantRepository` auto-filter, Postgres RLS wiring, `/api/v1` versioning, `Tenant` + `Membership` entities, and rework `User` to remove `roles`.

## Key Insights
- `data-source.ts:15` auto-globs `modules/**/*.entity` → new entities register with zero config.
- `server.ts:28` sets `routePrefix: '/api'` → change to `/api/v1`.
- RLS requires the DB connection to run `SET LOCAL app.tenant_id = '<uuid>'` **inside the same transaction** as queries. TypeORM default pooled connections do NOT hold a transaction per request → must wrap tenant-scoped requests in a transaction OR use a per-request query runner with `SET LOCAL`.
- `SET LOCAL` scopes to transaction; `SET` scopes to session (leaks across pooled connections). Use `SET LOCAL` only.
- App-layer filter (Layer 1) is the primary guard for dev ergonomics + query builder; RLS (Layer 2) is the hard backstop.

## Requirements
**Functional**
- Every authenticated request carries a resolved `tenantId` in AsyncLocalStorage.
- `BaseTenantRepository` auto-applies `WHERE tenant_id = :ctx` on reads and auto-sets `tenant_id` on writes.
- RLS policies deny any row where `tenant_id <> current_setting('app.tenant_id')`.
- API served under `/api/v1`.

**Non-functional**
- Zero cross-tenant leakage provable by test. RLS adds <1 SQL statement/request overhead.

## Architecture
```
Request → JWT auth → tenant-context.middleware (reads tenant_id claim)
        → AsyncLocalStorage.run({ tenantId }, next)
        → controller → service → BaseTenantRepository
             ├─ Layer1: appends tenant_id filter from ALS
             └─ Layer2: tx wrapper runs `SET LOCAL app.tenant_id` before queries
```
- **Tenant context store:** `src/common/tenant/tenant-context.ts` — `AsyncLocalStorage<{ tenantId: string }>` + `getTenantId()` (throws if absent for tenant-scoped ops).
- **Data flow:** `tenant_id` enters via JWT claim → middleware → ALS → repository filter + `SET LOCAL`. Exits only rows matching ctx.
- **Transaction wrapper:** `src/common/tenant/tenant-transaction.ts` — helper `runInTenantContext(dataSource, tenantId, work)` that opens queryRunner, `SET LOCAL`, runs work, commits.

## Related Code Files
**Create**
- `src/common/base/tenant-entity.base.ts` — `BaseTenantEntity extends BaseEntity` adds `@Column tenant_id` + `@Index(['tenantId', ...])` lead convention (subclasses declare composite).
- `src/common/base/tenant-repository.base.ts` — `BaseTenantRepository<T>` wraps `Repository<T>`, injects tenant filter + sets tenant_id on create.
- `src/common/tenant/tenant-context.ts` — ALS store + `getTenantId()`/`runWithTenant()`.
- `src/common/tenant/tenant-transaction.ts` — `SET LOCAL` tx helper.
- `src/common/middlewares/tenant-context.middleware.ts` — routing-controllers global middleware; resolves tenantId from `req.user`/JWT claim → ALS.
- `src/modules/tenant/tenant.entity.ts` — `Tenant` (name, slug unique, timezone, status). Extends `BaseEntity` (NOT tenant-scoped).
- `src/modules/tenant/tenant.repository.ts`, `tenant.service.ts`.
- `src/modules/membership/membership.entity.ts` — `Membership(user_id, tenant_id, role enum)`, UNIQUE(user_id,tenant_id).
- `src/modules/membership/membership.repository.ts`.
- `src/database/migrations/{ts}-tenant-foundation.ts` — `CREATE EXTENSION IF NOT EXISTS btree_gist`; create tenants, memberships; enable RLS + policies on memberships; rework users.

**Modify**
- `src/server.ts:28` → `routePrefix: '/api/v1'`; register `tenant-context.middleware` after passport.
- `src/config/data-source.ts` — no entity change (auto-glob); consider `extra` for statement settings if needed.
- `src/modules/user/user.entity.ts` — drop `roles` column, drop unique index on email → email now nullable-unique globally (users are global identities; tenant scoping via Membership). Keep email global-unique (a user = one login).
- `src/modules/user/user.repository.ts` — unaffected (users global).

**Delete** — none.

## Implementation Steps
1. Add `BaseTenantEntity` (tenant_id uuid, not null). Document: subclasses MUST declare `@Index(['tenantId','<natural key>'], { unique })`.
2. Build `tenant-context.ts` ALS store; `getTenantId()` throws `UnauthorizedException` if missing.
3. Build `tenant-context.middleware.ts`: read `tenantId` from authenticated `req.user`'s active membership / JWT claim; call `runWithTenant`.
4. Build `tenant-transaction.ts` `runInTenantContext` executing `SET LOCAL app.tenant_id`.
5. Build `BaseTenantRepository`: `find*` merge `{ tenantId }`; `create` set `tenantId = getTenantId()`; expose protected `qb()` that always `.andWhere('tenant_id = :t')`.
6. Create `Tenant` + `Membership` entities/repos/services.
7. Migration: `CREATE EXTENSION btree_gist`; tenants + memberships tables; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE`; policy `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` on memberships.
8. Rework users migration: drop `roles`, migrate any existing roles → memberships backfill (seed super_admin membership if applicable).
9. Switch `routePrefix` to `/api/v1`; smoke-test existing auth/user endpoints under new prefix.
10. Add RLS integration test (testcontainers): two tenants, assert tenant A cannot read tenant B rows even with app-filter bypassed.

## Todo
- [x] BaseTenantEntity
- [x] tenant-context (ALS) + getTenantId/getTenantIdOrNull/getTenantManager
- [x] tenant-transaction `set_config(...,true)` helper (SET LOCAL equivalent)
- [x] BaseTenantRepository (Layer-1 filter + ALS-manager preference)
- [x] Tenant entity/repo/service
- [x] Membership entity/repo (+ MembershipRole)
- [x] Migration: uuid-ossp + btree_gist ext + tenants + memberships (up/down verified reversible)
- [x] routePrefix → /api/v1
- [x] RFC 7807 problem+json error contract (buildProblem + error-handler + 404) — smoke-verified
- [x] OpenTelemetry tracing bootstrap (env-gated) + trace_id in logs — boot-verified both on/off
- [x] Build + typecheck + lint + unit (5/5) + integration (6/6) green
- [ ] ~~tenant-context.middleware~~ → **moved to phase-01** (needs JWT `tenant_id` claim; a global before-middleware can't read `req.user`)
- [ ] ~~User rework (drop roles) + backfill~~ → **moved to phase-01** (atomic with Membership-based RBAC; avoids breaking auth mid-phase)
- [ ] ~~RLS policies + cross-tenant integration test~~ → **moved to phase-02** (first business table `services`; RLS on `memberships` would deadlock the pre-context login lookup)

### Resequencing note (shippability)
Phase-00 ships the **tenant mechanism** (context API, base classes, RLS `set_config` helper, tenant/membership schema, `/api/v1`) with auth fully intact. Three items intentionally deferred so every commit stays green — see strikethroughs above. Plan table + phase-01/02 updated accordingly.

## Success Criteria
- Existing auth/user endpoints pass under `/api/v1`.
- RLS test: cross-tenant read returns 0 rows even when app filter disabled.
- `getTenantId()` populated for every authenticated tenant-scoped request.
- `CREATE EXTENSION btree_gist` succeeds in CI fresh DB.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Pooled conn leaks `SET` across requests | Med×High | Use `SET LOCAL` inside tx only; never bare `SET` |
| User rework breaks login | Med×High | Backfill memberships before dropping `roles`; test login pre/post |
| ALS context lost across async boundaries | Low×High | Wrap entire request in `run()`; avoid detached promises |
| Forgot `FORCE ROW LEVEL SECURITY` (table owner bypasses) | Med×High | Use `FORCE`; run app as non-owner role |

## Security Considerations
- RLS deny-by-default; `current_setting('app.tenant_id', true)` returns NULL if unset → policy must fail closed (NULL comparison → no rows).
- App DB role must NOT be table owner nor have BYPASSRLS (except intentional super_admin path, phase-07).
- Tenant switch must re-issue JWT with new `tenant_id` claim (no client-supplied tenant override).

## Next Steps
- Unblocks phase-01 (RBAC guard reads Membership) and all tenant-scoped domains.

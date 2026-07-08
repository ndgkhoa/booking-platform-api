# Phase 1 — Multi-tenancy core

## Context links
- ADR-0001 (`docs/adr/0001-multi-tenancy-isolation-strategy.md`), `docs/system-architecture.md`.
- Reuse: `src/common/base/entity.base.ts`, `src/config/data-source.ts`, `src/modules/user/*`, `authorizationChecker` in `src/server.ts`.

## Overview
- **Priority:** critical (unblocks everything) · **Status:** next.
- Introduce tenant model + request-scoped tenant context + two-layer isolation (app filter + Postgres RLS), and upgrade auth to tenant-aware JWT with refresh rotation.

## Key insights
- User becomes a **global identity**; role lives on the tenant relationship, not on user. Drop `User.roles` simple-array.
- RLS needs the DB session GUC `app.tenant_id` set per transaction/connection — wire it where the DataSource hands out connections / at request boundary.
- Refresh tokens stored **hashed** with a `family_id`; reuse of a rotated token ⇒ revoke whole family (theft detection).

## Requirements
- Functional: resolve tenant per request; scope all tenant data; issue access+refresh; rotate refresh; role-based access within a tenant.
- Non-functional: tenant A cannot read/write tenant B even if app filter is bypassed (RLS proves it).

## Architecture
- `common/tenant/tenant-context.ts` — `AsyncLocalStorage<{ tenantId, userId, role }>`; helpers `runWithTenant()`, `getTenantId()`.
- `common/middlewares/tenant-context.middleware.ts` — resolve tenantId from JWT claim (fallback `X-Tenant` header / subdomain), open ALS scope.
- `common/base/tenant-scoped.repository.ts` — extends existing repo pattern; auto-adds `where tenant_id` on reads, sets it on inserts.
- RLS: migration `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` per tenant table; set `SET LOCAL app.tenant_id` inside the tenant transaction wrapper.
- Auth: `token.service.ts` payload `{ sub, tenant_id, role }`; new `refresh-token.service.ts` + `refresh_tokens` table.
- `authorizationChecker` reads role from tenant context instead of `user.roles`.

## Related code files
- **Create:** `modules/tenant/{tenant.entity,tenant-member.entity,tenant.repository,tenant.service}.ts`, `modules/auth/refresh-token.{entity,service}.ts`, `common/tenant/*`, `common/base/tenant-scoped.repository.ts`, migration(s).
- **Modify:** `modules/user/user.entity.ts` (drop roles), `modules/auth/{auth.service,token.service,jwt.strategy}.ts`, `src/server.ts` (authorizationChecker + mount tenant middleware), `src/config/data-source.ts` (per-request GUC hook).

## Implementation steps
1. Entities: `Tenant` (name, slug, timezone, plan default `free`), `TenantMember` (tenant_id, user_id, role enum `owner|staff`, invited_at, joined_at, UNIQUE(tenant_id,user_id)); refactor `User` to global identity.
2. Migration for the three tables + `refresh_tokens` (id, user_id, tenant_id, token_hash, family_id, expires_at, revoked_at, replaced_by).
3. Tenant context ALS + middleware; register before controllers.
4. `TenantScopedEntity` base + `tenant-scoped.repository.ts`; migrate `User`-adjacent tenant data to use it (services/bookings later inherit).
5. RLS migration + GUC wiring in a `withTenantTransaction()` helper on the DataSource.
6. Refresh rotation + reuse detection in `refresh-token.service.ts`.
7. Upgrade JWT payload + `authorizationChecker` + `@Authorized([Role.OWNER])`.

## Todo
- [ ] Tenant/TenantMember/refresh_tokens entities + migration
- [ ] Refactor User (drop roles) + migration
- [ ] Tenant context ALS + middleware
- [ ] Tenant-scoped base repository
- [ ] RLS policies + GUC transaction wrapper
- [ ] Refresh rotation + reuse detection
- [ ] Tenant-aware JWT + RBAC
- [ ] Tests (isolation + rotation)

## Success criteria
- Integration: tenant A request cannot read tenant B rows (assert even with app filter removed → RLS blocks).
- Refresh: rotating returns new pair; replaying an old refresh revokes the family (401).
- typecheck + lint + unit + integration green.

## Risks & mitigation
- RLS + connection pooling: GUC must be `SET LOCAL` inside the tenant transaction so it never leaks across pooled connections. Mitigate with the `withTenantTransaction()` wrapper and a test asserting isolation under reused connections.
- Breaking existing auth/user tests → update them to the tenant-aware shape.

## Security
- Hashed refresh tokens only; short access TTL (15m) + rotating refresh; role checked server-side from tenant context, never trusted from client.

## Next
- Phase 2 consumes tenant context for onboarding + invites.

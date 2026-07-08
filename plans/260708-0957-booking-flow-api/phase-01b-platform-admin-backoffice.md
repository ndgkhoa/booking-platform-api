# Phase 1b — Platform admin & back-office

## Context links
- Depends on Phase 1 (tenant model, global user identity, DB-backed authorization checker).
- Phase 1 already laid the schema: `users.platform_role` enum (`super_admin`, nullable) + `PlatformRole` enum. This phase builds the authorization branch, the `/admin` surface, and bootstrapping.

## Overview
- **Priority:** medium (unblocks operator/back-office) · **Status:** pending.
- A platform-level super admin that manages the whole system across tenants, on a **dedicated surface** that is the only sanctioned cross-tenant path — tenant endpoints stay tenant-scoped.

## Key insights
- `platform_role` is an **orthogonal axis** to the tenant `Role` (owner|staff). A super admin is not a tenant member by virtue of this role.
- The authorization checker already loads the user from DB, so `req.user.platformRole` is available with no extra query. Platform authZ reads it from DB (never trusts a JWT claim) → immediate revoke.
- `/admin` routes are the **only** place cross-tenant reads/writes are allowed. Everything there must be audit-logged (ties to Phase 9 `audit_logs`).

## Requirements
- Functional: super admin lists/inspects all tenants and users, suspends/reactivates a tenant, promotes/demotes platform admins. Ordinary users get 403 on `/admin/*`.
- Non-functional: no cross-tenant leak through tenant endpoints; every admin mutation audited; first admin bootstrappable without a chicken-and-egg.

## Architecture
- **AuthZ branch:** extend `authorizationChecker` in `src/server.ts` — when the required role is a `PlatformRole`, authorize by `user.platformRole` and **skip** the tenant-membership + tenant-context requirement. Introduce `@Authorized([PlatformRole.SUPER_ADMIN])` (or a thin `@PlatformAdmin()` decorator wrapping it).
- **Surface:** `modules/admin/*` controllers mounted under `/admin`, all `PlatformRole.SUPER_ADMIN`-gated, **not** tenant-scoped:
  - `GET /admin/tenants`, `GET /admin/tenants/:id` (with members), `PATCH /admin/tenants/:id` (suspend/reactivate).
  - `GET /admin/users` (system-wide search), `POST /admin/users/:id/platform-role` (promote/demote).
- **Bootstrap:** env `SUPERADMIN_EMAIL` + a `promote-admin` script/CLI (and the dev seeder flags `admin@example.com`). Migration does **not** hardcode a real admin.
- **RLS note:** once RLS is wired into the runtime (see ADR-0001 / Phase 3+), `/admin` queries must run as a `BYPASSRLS`/superuser connection since they intentionally cross tenants without an `app.tenant_id` GUC.

## Related code files
- **Create:** `modules/admin/{admin-tenant.controller,admin-user.controller,admin.service}.ts`, DTOs, `scripts/promote-admin.ts` (or a seeder command).
- **Modify:** `src/server.ts` (authZ platform branch), `modules/tenant/*` (suspend flag on `Tenant`), audit hook (Phase 9).

## Implementation steps
1. AuthZ branch for `PlatformRole` in `authorizationChecker` (+ `@PlatformAdmin` helper).
2. `Tenant.status` (active|suspended) column + migration; block login/booking for suspended tenants.
3. `/admin/tenants` list/detail/suspend endpoints.
4. `/admin/users` search + platform-role promote/demote.
5. Bootstrap: `SUPERADMIN_EMAIL` + promote script; dev seeder flag.
6. Audit every admin mutation (integrate with Phase 9 `audit_logs`, or a local interceptor if Phase 9 not yet done).

## Todo
- [ ] Platform-role authZ branch + `@PlatformAdmin` decorator
- [ ] Tenant status (suspend/reactivate) + enforcement
- [ ] `/admin/tenants` endpoints
- [ ] `/admin/users` search + role promote/demote
- [ ] Bootstrap (env + promote script + dev seeder)
- [ ] Audit logging on admin mutations
- [ ] Tests: non-admin 403; admin cross-tenant list; suspend blocks login; audit rows written

## Success criteria
- E2E: super admin lists all tenants/users; ordinary owner gets 403 on `/admin/*`; suspending a tenant blocks its members' login; every admin mutation writes an audit row; promoting a user grants `/admin` access immediately (DB-checked).

## Risks
- `/admin` is the cross-tenant break-glass — a single missing `@PlatformAdmin` gate = full-system exposure. Gate at the controller class level.
- Don't leak `platform_role` decisions into tenant `Role` checks; keep the axes separate.

## Security
- Platform role read from DB per request (no JWT claim). All admin actions audited with actor id. Suspended tenants fail closed.

## Next
- Feeds Phase 9 (audit trail formalization, per-tenant rate limits also apply to admin).

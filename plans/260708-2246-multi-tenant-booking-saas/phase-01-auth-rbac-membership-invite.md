# Phase 01 — Auth + RBAC + Membership + Invite Flow

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-00](phase-00-tenant-foundation-and-rls.md)
- Existing: `src/server.ts:36-49` (authorizationChecker), `src/modules/auth/token.service.ts:6-9` (JwtPayload), `src/modules/auth/jwt.strategy.ts`, `src/jobs/queues/email.queue.ts`

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Replace `users.roles`-based authz with Membership-derived RBAC scoped to active tenant. JWT carries `tenant_id`. Email invite flow (BullMQ) to add owner/staff to a tenant.

## Key Insights
- `token.service.ts:6-9` JwtPayload `{sub, roles}` → change to `{sub, tenantId, role}` (role = active-tenant membership role). Remove `roles`.
- `server.ts:44` `roles.some(r => user.roles.includes(r))` → replace with Membership lookup for `(user.sub, ctx.tenantId)`.
- Roles: `super_admin` (global, no tenant), `owner`, `staff`, `customer` (customer is separate table — auth'd via customer login, NOT Membership; keep membership roles = owner/staff/super_admin).
- Invite = token (uuid/JWT, TTL) emailed; accept creates Membership. Reuse BullMQ email queue but generalize job payload.

## Requirements
**Functional**
- Login returns JWT with `tenant_id` + `role` for the user's active/primary tenant; endpoint to switch tenant re-issues token.
- `@Authorized(['owner'])` (or custom `@Roles`) resolves via Membership for ctx tenant.
- Owner invites user by email+role → email sent → invitee accepts → Membership created.
- super_admin authorized regardless of tenant context.

**Non-functional**
- Invite tokens single-use, expiring, revocable.

## Architecture
```
POST /auth/login → validate → find memberships → pick active tenant → sign JWT{sub,tenantId,role}
authorizationChecker → passport jwt → load user → tenant-context set tenantId
   → MembershipRepository.findRole(user, tenantId) → compare required roles
Invite: POST /tenants/:id/invites (owner) → InviteToken row + enqueue email
        POST /invites/accept {token} → validate → create Membership → revoke token
```
- **Data flow:** role enters from Membership table (single source of truth) → cached in JWT claim per session → re-validated server-side on each authz check (JWT claim is hint, Membership is authority for sensitive ops).

## Related Code Files
**Create**
- `src/modules/membership/membership.service.ts` — resolveRole, listForUser, create/revoke.
- `src/modules/auth/rbac.guard.ts` OR custom `@Roles()` decorator + authorizationChecker integration.
- `src/modules/invite/invite.entity.ts` — `InviteToken(tenant_id, email, role, token_hash, expires_at, accepted_at)` extends `BaseTenantEntity`.
- `src/modules/invite/invite.repository.ts`, `invite.service.ts`, `invite.controller.ts`.
- `src/modules/invite/dto/create-invite.dto.ts`, `accept-invite.dto.ts`.
- `src/jobs/queues/invite-email.job.ts` OR generalize email payload (see phase-04 outbox note).
- `src/database/migrations/{ts}-invites.ts`.

**Modify**
- `src/modules/auth/token.service.ts:6-9` — JwtPayload → `{ sub, tenantId, role }`.
- `src/modules/auth/jwt.strategy.ts` — attach payload claims to `req.user`/context.
- `src/modules/auth/auth.service.ts`, `auth.controller.ts` — login returns tenant-scoped token; add `POST /auth/switch-tenant`.
- `src/server.ts:36-49` — authorizationChecker resolves role via MembershipService using ctx tenantId; super_admin short-circuit.

**Delete** — none (users.roles already dropped in phase-00).

## Implementation Steps
1. Extend JwtPayload with `tenantId`, `role`; update `TokenService.sign` signature.
2. Update login: fetch memberships, choose primary (or require tenant selection), sign token.
3. Add `POST /auth/switch-tenant` → validate membership → re-issue token.
4. Rewrite authorizationChecker: super_admin bypass; else `MembershipService.resolveRole(sub, ctxTenantId)` ∈ required.
5. Build Invite entity/repo/service; store `token_hash` (never plaintext), TTL, single-use.
6. `POST /tenants/:id/invites` (owner only) → create token → enqueue invite email.
7. `POST /invites/accept` → verify hash+expiry+unused → create Membership → mark accepted.
8. Generalize BullMQ email job to carry template + payload (prep for outbox).
9. Tests: role resolution matrix, invite happy/expired/reused/wrong-email paths.

## Todo
- [x] JwtPayload → {sub,tenantId,role}; TokenService update
- [x] Drop user.roles → add is_super_admin (migration + backfill, reversible)
- [x] Tenant-context middleware (decode token → ALS + req.tokenClaims), registered globally
- [x] authorizationChecker via token role claim + super_admin bypass, fail-closed
- [x] Login tenant-scoped token (primary membership) + switch-tenant endpoint
- [x] Tenant onboarding: POST /tenants (atomic tenant + owner membership) → owner-scoped token
- [x] Shared integration harness (one testcontainer for the whole suite) + onboarding e2e (12 tests green)
- [x] Refresh-token rotation + reuse detection (family revoke on replay) + logout — 5 e2e green
- [ ] Invite entity/repo/service/controller + DTOs — **next slice**
- [ ] Invite email job (generalized payload) — next slice

### Slice notes
- Slice 1: auth/tenant-activation core (deferred phase-00 items + onboarding + switch-tenant).
- Slice 2: refresh-token rotation — opaque token, SHA-256 at rest, `family_id` chain; replay of a rotated token burns the family (theft response). `POST /auth/refresh` + `/auth/logout`. Access token TTL stays short; refresh TTL `REFRESH_TOKEN_TTL_DAYS` (30d). Known simplification: `switch-tenant` scopes the access token for its lifetime; a later refresh re-derives scope from the token's stored snapshot.
- Remaining: invite flow.

## Success Criteria
- Owner-only endpoint rejects staff (403 FORBIDDEN), allows owner.
- super_admin authorized across tenants.
- Invite accept creates Membership; expired/reused token → 4xx with stable errorCode.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| JWT role stale after revoke | Med×Med | Sensitive ops re-check Membership server-side; short token TTL + refresh |
| Invite token leak | Low×High | Store hash only; TTL; single-use; scope to email |
| Tenant switch privilege confusion | Med×High | Re-issue token; never trust client tenant param |

## Security Considerations
- Invite tokens hashed at rest; constant-time compare.
- authorizationChecker must fail closed if tenant context missing.
- Rate-limit invite + accept endpoints.

## Next Steps
- Unblocks phase-02 (owner/staff manage services & staff), phase-07 (super-admin, billing).

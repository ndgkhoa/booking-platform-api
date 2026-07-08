# Phase 2 — Onboarding, auth flows, invites

## Context links
- Depends on Phase 1 (tenant context, refresh tokens, RBAC). Reuse `jobs/queues/email.queue.ts` for invite emails.

## Overview
- **Priority:** high · **Status:** pending.
- Public tenant signup, full auth lifecycle (login/refresh/logout), and email-based member invites.

## Requirements
- Functional: create tenant + owner atomically; login → access+refresh; refresh endpoint; logout revokes refresh; owner invites staff by email; invitee accepts → becomes member.
- Non-functional: signup atomic (no orphan tenant/owner); invite tokens single-use, hashed, TTL-bound.

## Architecture
- `modules/tenant/onboarding.service.ts` — `dataSource.transaction`: insert User (bcrypt) + Tenant + TenantMember(owner) together.
- `modules/auth/auth.controller.ts` — add `POST /auth/refresh`, `POST /auth/logout`; keep `/auth/register` as tenant signup or split `/tenants/signup`.
- `modules/tenant/invite.service.ts` + `tenant_invites` table (email, tenant_id, role, token_hash, expires_at, accepted_at). Email via BullMQ.
- Endpoints: `POST /tenants/:id/invites` (owner), `POST /invites/accept` (token).

## Related code files
- **Create:** `modules/tenant/{onboarding.service,invite.service,invite.entity}.ts`, DTOs, invite email job, migration for `tenant_invites`.
- **Modify:** `modules/auth/{auth.controller,auth.service}.ts`, `jobs/workers/email.worker.ts` (invite template).

## Implementation steps
1. Onboarding transaction (User+Tenant+Owner).
2. Refresh + logout endpoints on top of Phase 1 refresh service.
3. Invite create (owner-only) → hashed token + queue email.
4. Invite accept → validate token/TTL, create/attach User, set `TenantMember.joined_at`.

## Todo
- [ ] Onboarding transaction + endpoint
- [ ] Refresh + logout endpoints
- [ ] Invite entity + create + email job
- [ ] Invite accept flow
- [ ] Tests (onboard → invite → accept → login as staff)

## Success criteria
- E2E: onboard owner → invite staff → accept → staff logs in with `staff` role; expired/reused invite rejected; all checks green.

## Risks
- Invite email must not leak token in logs; store only hash. Accept endpoint rate-limited.

## Next
- Phase 3 (services/staff) uses owner/staff roles established here.

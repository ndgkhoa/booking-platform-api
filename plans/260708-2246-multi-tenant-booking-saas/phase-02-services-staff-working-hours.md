# Phase 02 — Services, Staff, Working Hours & Time-Off

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-00](phase-00-tenant-foundation-and-rls.md), [phase-01](phase-01-auth-rbac-membership-invite.md)
- Existing base: `BaseTenantEntity` (phase-00), `Money`/`TimeRange` VOs (create here or phase-03).

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Bookable catalog. `Service` (duration, price, buffer), `Staff` (linked to a Membership user), staff↔service capability link, weekly `WorkingHours`, and `TimeOff` overrides. Pure CRUD + constraints; no availability computation yet (phase-03).

## Key Insights
- **[Blocker from phase-01 invite review] RLS rollout must handle `invites` + `refresh_tokens`:** when enabling RLS/FORCE on tenant tables, `InviteRepository.create` must run inside `runInTenantContext` (else `WITH CHECK` rejects the INSERT), and the intentional cross-tenant `InviteRepository.findByHash` (accept-by-token) needs an explicit RLS carve-out (SECURITY DEFINER function, a `BYPASSRLS` read path, or a policy allowing token-hash lookup). Same consideration for any global-lookup-by-secret table. Settle the per-request RLS strategy (M3 from phase-00 review: fail-fast vs. tenant-tx-per-request) here.
- Staff = a Membership user (role staff/owner) who performs services. Model `Staff` as tenant-scoped profile referencing `user_id`, NOT a duplicate identity.
- `Money` VO (integer minor units) introduced here for service price; never float.
- WorkingHours modeled per weekday (0-6) with local `HH:mm` open/close; interpreted in `tenant.timezone` (phase-03 converts). Store as minutes-from-midnight or time columns — pick time columns for clarity.
- TimeOff = concrete UTC range overrides (vacation, sick) that subtract availability.
- Staff-can-perform-service is a many-to-many join → gates booking creation.

## Requirements
**Functional**
- CRUD Service (name, duration_min, price Money, buffer_before_min, buffer_after_min, active).
- CRUD Staff profile (user_id, display_name, active).
- Link/unlink staff↔service (capability).
- CRUD WorkingHours per staff per weekday (multiple intervals/day allowed).
- CRUD TimeOff per staff (UTC range, reason).

**Non-functional**
- All rows tenant-scoped (RLS + app filter). Composite uniques lead with tenant_id.

## Architecture
```
Tenant
 ├─ Service (duration, price, buffers)
 ├─ Staff (user_id) ──< StaffService >── Service   (capability m2m)
 │    ├─ WorkingHours (weekday, start_local, end_local)
 │    └─ TimeOff (starts_at_utc, ends_at_utc)
```
- **Data flow:** owner/staff manage catalog → persisted tenant-scoped → consumed read-only by AvailabilityService (phase-03).

## Related Code Files
**Create**
- `src/common/value-objects/money.ts` — amount (int minor units) + currency; arithmetic, no float.
- `src/common/value-objects/time-range.ts` — start/end, overlaps(), duration; used phase-03 too.
- `src/modules/service/service.entity.ts` (`services`) extends `BaseTenantEntity`; UNIQUE(tenant_id,name).
- `src/modules/service/{service.repository,service.service,service.controller}.ts` + DTOs.
- `src/modules/staff/staff.entity.ts` (`staff`) — user_id FK; UNIQUE(tenant_id,user_id).
- `src/modules/staff/staff-service.entity.ts` (`staff_services`) — (staff_id, service_id); UNIQUE(tenant_id,staff_id,service_id).
- `src/modules/staff/working-hours.entity.ts` (`working_hours`) — staff_id, weekday, start_local time, end_local time.
- `src/modules/staff/time-off.entity.ts` (`time_off`) — staff_id, starts_at, ends_at (timestamptz).
- staff repositories/services/controllers + DTOs (split files, each <200 lines).
- `src/database/migrations/{ts}-catalog-staff-schedule.ts`.

**Modify** — none of existing modules.

**Delete** — none.

## Implementation Steps
1. Implement `Money` + `TimeRange` VOs with unit tests (pure, no DB).
2. Service entity/repo (extend BaseTenantRepository)/service/controller + DTOs; price via Money transformer (store `price_amount` int + `price_currency`).
3. Staff entity referencing user_id; guard: user must have owner/staff membership in tenant.
4. StaffService capability join + link/unlink endpoints.
5. WorkingHours CRUD; validate start_local < end_local; allow multiple per weekday; reject overlaps within same staff/weekday.
6. TimeOff CRUD; validate starts_at < ends_at.
7. Migration with all tables, RLS enable + policies, composite indexes leading tenant_id.
8. Tests: CRUD, capability gating, working-hours overlap rejection, tenant isolation.

## Todo
**Slice A (done):**
- [x] Money VO + TimeRange VO + unit tests (13 unit green)
- [x] Service entity/repo/service/controller/DTOs (CRUD, owner-gated mutations)
- [x] **Per-request tenant transaction middleware** (SET LOCAL app.tenant_id, commit 2xx/rollback 4xx+) — the RLS execution model
- [x] Migration: services + RLS ENABLE/FORCE/policy (reversible)
- [x] Cross-tenant isolation: Layer-1 e2e (service catalog) + Layer-2 DB RLS proof (rls-isolation via SET ROLE) — 31 integration green
- [x] Documented RLS superuser caveat + resolved phase-00 M3 (per-request tenant-tx strategy)

**Slice B (next):**
- [ ] Staff entity/repo/service/controller (user_id, membership guard)
- [ ] StaffService capability link
- [ ] WorkingHours CRUD + overlap validation
- [ ] TimeOff CRUD
- [ ] Migration: staff+schedule (+RLS on each, composite indexes)
- [ ] Invite/refresh RLS carve-out decision (H2 from phase-01 review) — invites/refresh_tokens stay RLS-free (token = capability), documented

### Slice A note
RLS is enforced per request via a tenant transaction; app connects as superuser in dev/test so Layer-1 is active there and Layer-2 (RLS) is proven at the DB layer. Production runs as a non-superuser role. `invites`/`refresh_tokens` intentionally RLS-free (global-lookup-by-secret).

## Success Criteria
- Owner can define a service, staff, link them, set weekly hours + time-off.
- Cannot link staff to service across tenants (RLS).
- Money never represented as float anywhere.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Money rounding/float creep | Med×High | Integer minor units VO; lint/review; no float columns |
| WorkingHours overlap ambiguity | Med×Med | Validate + test multi-interval days |
| Staff-user drift (staff without membership) | Med×Med | Validate membership on staff create; cascade on membership revoke |

## Security Considerations
- Only owner (or super_admin) mutates catalog/staff; staff may edit own hours/time-off (RBAC).
- Tenant-scoped uniqueness prevents cross-tenant name collisions being exploitable.

## Next Steps
- Feeds phase-03 AvailabilityService (reads hours, time-off, capability, buffers, duration).

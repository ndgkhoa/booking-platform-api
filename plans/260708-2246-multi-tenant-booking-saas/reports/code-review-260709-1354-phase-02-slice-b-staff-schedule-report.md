# Code Review — Phase-02 Slice B (Staff Directory, Capability, Schedule)

Commit `0fdf639` vs `ad753c9` on `develop`. Read-only review. Doc/plan `.md` changes ignored.

## Scope
- Modules: `staff/`, `staff-service/`, `working-hours/`, `time-off/`; migration `1780298700000-StaffAndSchedule`.
- Layering deltas in `auth.service`, `jwt.strategy`, `user.service`, `service.*`, `tenant.service` (pure delegation — clean, no findings).
- Green already: typecheck/lint/unit 13/unit int 38/migration up-down. This pass targets correctness/security/design.

## Overall Assessment
Solid slice. Tenant isolation holds through two layers (app-scoped reads + RLS FORCE/WITH CHECK). `scopedWhere` used consistently, `persist` stamps tenant from context (never caller), global `validation.whitelist + forbidNonWhitelisted` (server.ts:36) neutralises mass-assignment. No Critical defects. The items below are hardening + one correctness gap that matters before phase-03 availability.

---

## Critical
None.

---

## High

### H1 — Working-hours overlap is check-then-insert with no DB guard (TOCTOU)
`working-hours.service.ts:21-25` reads `findForStaffWeekday`, runs the JS overlap test, then inserts. Each request is its own READ COMMITTED transaction, so two concurrent POSTs for the same staff+weekday both read the pre-insert state, both pass, both commit → overlapping intervals persist. No unique/exclusion constraint backstops it (`IDX_working_hours_staff_weekday` is non-unique). Owner-only + low concurrency makes this low-probability today, but phase-03 availability computation assumes non-overlapping intervals — overlaps there silently corrupt slot math.
- Fix: add a Postgres exclusion constraint (needs `btree_gist`):
  `EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, weekday WITH =, int4range(start_min, end_min) WITH &&) WHERE (deleted_at IS NULL)`, then map `23P01` → 409 alongside the existing JS check. Recommend before phase-03 depends on the invariant.

---

## Medium

### M1 — No DB-level tenant consistency between child rows and referenced parents (defense-in-depth)
`staff_services.staff_id/service_id`, `working_hours.staff_id`, `time_off.staff_id` are plain FKs to the *global* PKs (`staff(id)`, `services(id)`), migration lines 40-41, 64, 84. RLS `WITH CHECK` validates only the row's own `tenant_id`; the FK only checks the parent exists globally. So the *sole* guarantee that a child attaches to a same-tenant parent is the app-layer `getById` (`staff-service.service.ts:18-19`, `working-hours.service.ts:16`, `time-off.service.ts:16`) plus RLS on that read. Currently holds (tenant-A owner attaching to tenant-B staff gets 404 at the read). But if any future caller inserts without the guard, the DB would accept a cross-tenant link (tenant_id=A, staff_id=B's).
- Fix: composite FKs enforce it at the DB — `UNIQUE(tenant_id, id)` on `staff`/`services`, then child FK `(tenant_id, staff_id) REFERENCES staff(tenant_id, id)` / `(tenant_id, service_id) REFERENCES services(tenant_id, id)`. Makes tenant consistency structural, not code-dependent.

### M2 — Soft-deleted staff cannot be re-created (unique index ignores `deleted_at`)
`staff` uses `softRemove` (`staff.repository.ts:36-40`) but `UQ_staff_tenant_user` (migration:26) has no `WHERE deleted_at IS NULL`. After removing a staff, POST with the same `userId` hits `23505` → `ConflictException('This user is already a staff member')` (`staff.service.ts:28-29`) — misleading, and re-hiring is impossible. `getById`/list correctly hide the soft-deleted row, so the user sees "no such staff" yet cannot add them.
- Fix: partial unique index `CREATE UNIQUE INDEX ... ("tenant_id","user_id") WHERE deleted_at IS NULL`, or restore-on-conflict in `create`. (Note: capability/working-hours/time-off use hard `delete`, so they are unaffected.)

### M3 — Membership guard read runs outside the request's tenant transaction
`MembershipRepository` binds to `dataSource.getRepository` (membership.repository.ts:10), i.e. the pooled manager, not the per-request RLS transaction. `staff.create` → `resolveRole` (staff.service.ts:21) therefore reads on a separate connection. It is *correct today* (explicit `userId AND tenantId` filter → cross-tenant safe; `memberships` has no RLS per TenantFoundation migration) and the guard holds, but it is brittle: the moment `memberships` gets `FORCE ROW LEVEL SECURITY`, this read returns null on the unset pooled connection and every staff create 400s. Also the guard read is not part of the create's atomic unit.
- Fix: either document the invariant "memberships is intentionally non-RLS" next to the repo, or route the read through the tenant transaction manager so it stays consistent if RLS is later added.

---

## Low

### L1 — `working-hours`/`time-off` DELETE ignores the `:staffId` path segment
Routes are `/staff/:staffId/working-hours/:id` and `.../time-off/:id`, but `remove(id)` scopes only by `id + tenant` (working-hours.repository.ts:24-28, time-off.repository.ts:20-24; controllers bind only `@Param('id')`). A row belonging to staff X (same tenant) can be deleted via staff Y's URL. Not a cross-tenant leak, but the URL contract is unenforced. Consider scoping delete by `{ id, staffId }`. (`staff-service` unlink is fine — scoped by staffId+serviceId.)

### L2 — List endpoints don't 404 on unknown/foreign `staffId`
`capabilities.list`/`hours.list`/`timeOff.list` return `[]` for a non-existent or other-tenant `staffId` (no `staff.getById` precheck), inconsistent with the create paths that 404. Minor API-shape inconsistency; add a `getById` guard if 404 is desired.

### L3 — Schedule rows survive staff soft-remove
Soft-removing a staff leaves its `working_hours`/`time_off`/`staff_services` rows (FK CASCADE fires only on hard delete). `getById` blocks *new* schedule writes (404), but phase-03 availability must explicitly filter by non-deleted + `active` staff or it will surface hours for removed staff. Also a staff row dangles if the user is later removed from the tenant (FK → `users`, not `memberships`) — acceptable, but availability/booking should re-check membership/active.

### L4 — `startMin` upper bound off by one
`create-working-hours.dto.ts` `@Max(1440)` on `startMin`; a start of 1440 is meaningless (always rejected later by `startMin >= endMin`). Harmless, but `@Max(1439)` is the precise bound. `endMin @Max(1440)` (24:00 end) is correct and documented.

---

## Focus-area verdicts
1. **Tenant isolation across FK refs** — holds. `getById` reads are RLS+app scoped (cross-tenant → 404 before insert), inserts stamp tenant from context, RLS `WITH CHECK` blocks tenant spoofing. Residual gap is DB-level parent-tenant consistency → M1.
2. **Overlap correctness/races** — half-open math correct (adjacent `[540,720)`+`[720,900)` accepted, verified by test schedule.e2e:60-65); weekday/min bounds fine (1440=24:00 intentional). Race → H1.
3. **Membership guard** — correct cross-tenant (filters userId AND tenantId); dangling-staff-on-user-removal acceptable → see M3, L3.
4. **Repository patterns** — no raw `this.repo` read/write escapes tenant scoping; all mutations `scopedWhere`, all reads via `findOne/findMany`, `persist` stamps tenant. Clean.
5. **StaffService naming collision** — handled correctly: entity aliased `StaffServiceEntity`, profile app-service imported as `StaffService`; TypeDI resolves by class reference so no DI ambiguity. No bug. (Task note said profile aliased as `StaffProfileService` — actual code aliases the *entity* instead; same effect, doc drift only.)
6. **General** — error codes correct (400 range/membership, 404 missing, 409 dup); `23505` handling matches the proven ServiceService pattern; no stray `any`; validation whitelist on. Soft-delete/unique interaction → M2.

## Positive Observations
- RLS ENABLE + FORCE + `tenant_isolation` USING/WITH CHECK on all four tables; composite indexes all lead with `tenant_id`; migration fully reversible (policies dropped before tables).
- `scopedWhere` array-branch handling prevents OR-branch tenant leaks; `persist` never trusts caller tenant.
- Global `forbidNonWhitelisted` means `UpdateStaffDto` (displayName/active only) can't be used to reassign `tenant_id`/`user_id` via extra body fields; RLS `WITH CHECK` is a second backstop.
- Good test coverage: cross-tenant 404 (staff.e2e:96), overlap 409 + half-open boundary + inverted-range 400 (schedule.e2e).

## Blockers before phase-03
- H1 (overlap exclusion constraint) — availability math assumes non-overlapping working hours; add the DB guard before phase-03 relies on it.
- L3 awareness — phase-03 availability/booking MUST filter deleted/inactive staff and re-validate membership.
- M1/M2 recommended (not hard blockers) but cheapest to land now while the migration is fresh.

## Unresolved Questions
1. Is `memberships` intentionally left out of RLS permanently (M3)? If it will gain RLS, `MembershipRepository`'s pooled read needs rerouting first.
2. Is time-off intentionally allowed to overlap other time-off (no overlap check, unlike working-hours)? Assumed yes (overlapping unavailability is harmless) — confirm.
3. Should DELETE routes enforce the `:staffId` segment (L1), or is id-only scoping the intended contract?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** No Critical/blocking-security defects; isolation and validation hold. One correctness gap (H1 overlap race) and DB-hardening items (M1 composite FK, M2 soft-delete unique) recommended before phase-03 availability.
**Concerns/Blockers:** H1 exclusion constraint + L3 staff-active filtering should be resolved before phase-03 depends on the non-overlap / active-staff invariants.

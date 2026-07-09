# Phase 03 — Availability + Booking Core (THE FLAGSHIP)

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-02](phase-02-services-staff-working-hours.md)
- Existing: `ConflictException` (`src/common/exceptions/app.exception.ts:40`), `BaseTenantEntity` (phase-00), `TimeRange`/`Money` VOs (phase-02).

## Overview
- **Priority:** P0 (the differentiator)
- **Status:** ⏭️ Next (in progress)
- **Description:** `AvailabilityService` (hardest domain logic), `Booking` entity with Postgres `EXCLUDE` double-booking guard, explicit state machine, Idempotency-Key on POST, `@VersionColumn` optimistic lock for reschedule/cancel, and concurrency integration test proving exactly-1-wins.

## Key Insights
- **EXCLUDE is the source of truth for no-double-booking.** App-level availability check is UX/pre-validation only; the constraint is the race-proof guarantee. Never rely on app check alone.
- Constraint: `EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('pending','confirmed'))`. Requires btree_gist (phase-00). Cancelled/completed/no_show excluded so freed slots rebook.
- Map SQLSTATE `23P01` (exclusion_violation) → `ConflictException` (409, code `BOOKING_SLOT_TAKEN`).
- **Timezone:** store `starts_at`/`ends_at` as `timestamptz` (UTC). WorkingHours are local (tenant.timezone). Availability computes candidate slots in tenant-local wall-clock then converts to UTC. DST: a local day may be 23/25h; generate slots by iterating local time and converting each — do NOT add fixed UTC offsets. Use luxon (recommend) for zone-aware arithmetic.
- **Availability formula:** `free = (workingHours[weekday, tenantTZ]) − timeOff − existingBookings(±buffers)`, then `slots = free windows sliced by service.duration`, filtered to staff that can perform service, honoring buffer_before/after.
- **Idempotency:** `Idempotency-Key` header → `idempotency_keys(tenant_id, key, request_hash, response_json, status)`; same key returns stored response; different body same key → 409/422.
- **Optimistic lock:** `@VersionColumn` on Booking; reschedule/cancel read version, update `WHERE version = :v`; mismatch → 409 `STALE_BOOKING`.

## Requirements
**Functional**
- `GET /availability?serviceId&staffId?&date` → bookable slots (staff-aware, buffer-aware, TZ-correct).
- `POST /bookings` (customer or staff-on-behalf) with Idempotency-Key → creates pending/confirmed booking; slot conflict → 409.
- State machine: `pending → confirmed → completed | cancelled | no_show`; `pending → cancelled`; illegal transitions rejected.
- `PATCH /bookings/:id/reschedule`, `/cancel`, `/confirm`, `/complete`, `/no-show` — guarded transitions + optimistic lock.

**Non-functional**
- Under N concurrent identical requests, **exactly 1** booking persists (constraint-enforced).
- Availability p95 acceptable for a day/week window (index-supported queries).

## Architecture
```
GET /availability → AvailabilityService.compute(serviceId, staffId?, dateRange)
   1. load service(duration,buffers), capable staff, workingHours, timeOff, existing bookings
   2. for each staff+local day: build free windows (hours − timeOff − bookings±buffer)
   3. slice by duration → convert local→UTC (luxon, DST-safe) → return slots

POST /bookings (Idempotency-Key)
   → idempotency lookup (hit → return stored)
   → runInTenantContext(tx): SET LOCAL app.tenant_id
       → INSERT booking (status pending/confirmed)
       → on 23P01 → ConflictException BOOKING_SLOT_TAKEN
       → store idempotency response
   → (phase-04) write outbox event booking.created in SAME tx

Transitions → BookingStateMachine.assertCanTransition(from,to) → update WHERE version → +outbox event
```
- **State machine:** `src/modules/booking/booking-state-machine.ts` — explicit `TRANSITIONS: Record<Status, Status[]>` + `assertCanTransition()`. No scattered ifs. Throws `UnprocessableStateException` (422, code `INVALID_BOOKING_TRANSITION`).
- **Data flow:** slot request → availability compute (read) → booking insert (write, constraint-guarded) → status changes (guarded + versioned) → outbox (phase-04).

## Related Code Files
**Create**
- `src/modules/booking/booking.entity.ts` (`bookings`) — tenant_id, staff_id, service_id, customer_id, starts_at, ends_at (timestamptz), status enum, `@VersionColumn version`, price snapshot (Money). Extends `BaseTenantEntity`.
- `src/modules/booking/booking-status.enum.ts` — pending/confirmed/completed/cancelled/no_show.
- `src/modules/booking/booking-state-machine.ts` — transition table + guards.
- `src/modules/booking/booking.repository.ts` — extends BaseTenantRepository; insert via tenant tx; catch 23P01.
- `src/modules/booking/booking.service.ts` — create/reschedule/cancel/confirm/complete/no-show; orchestrates SM + idempotency + outbox stub.
- `src/modules/booking/booking.controller.ts` + DTOs (`create-booking.dto.ts`, `reschedule-booking.dto.ts`).
- `src/modules/availability/availability.service.ts` — compute (split helpers: window-builder, slot-slicer, tz-converter each <200 lines).
- `src/modules/availability/availability.controller.ts` + query DTO.
- `src/common/idempotency/idempotency.entity.ts` (`idempotency_keys`), `idempotency.repository.ts`, `idempotency.middleware.ts` (or service helper).
- `src/common/exceptions/app.exception.ts` — add `UnprocessableStateException` (422, stable code).
- `src/database/migrations/{ts}-bookings-exclude-and-idempotency.ts` — bookings table + EXCLUDE constraint + supporting btree_gist index + idempotency_keys + RLS.
- `src/modules/customer/customer.entity.ts` (`customers`) + repo/service if not created in phase-02 — tenant-scoped customer identity (per LOCKED decision #1). UNIQUE(tenant_id,email).
- Tests: `src/modules/booking/__tests__/booking-concurrency.integration.test.ts` (testcontainers), state-machine unit test, availability DST unit tests.

**Modify**
- `src/common/exceptions/index.ts` — export new exception.

**Delete** — none.

## Implementation Steps
1. Create `customers` table (tenant-scoped) if not already; a booking references customer_id.
2. Booking entity with `@VersionColumn`, status enum, timestamptz range, price snapshot.
3. Migration: create bookings; add `ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('pending','confirmed'))`; enable RLS.
4. Booking repository insert inside `runInTenantContext`; wrap driver error → detect `err.code === '23P01'` → `ConflictException('BOOKING_SLOT_TAKEN')`.
5. State machine module with transition table + `assertCanTransition`; wire into every status-change service method.
6. Idempotency: entity + middleware/helper; POST /bookings stores key+request_hash+response; replay returns stored; body mismatch → 422.
7. AvailabilityService: load inputs via repos; build free windows (hours − timeOff − bookings±buffer); slice by duration; luxon local→UTC DST-safe; filter capable staff.
8. Reschedule/cancel/confirm/complete/no-show endpoints with optimistic `WHERE version` update; mismatch → 409 STALE_BOOKING.
9. Concurrency integration test: seed slot; fire N (e.g. 20) parallel POSTs same staff+range; assert exactly 1 success, N−1 → 409.
10. DST unit tests: booking across spring-forward/fall-back day; assert correct UTC + slot counts.

## Todo
**Slice A — booking core (done):**
- [x] customers module (tenant-scoped, RLS, partial-unique email)
- [x] Booking entity (+VersionColumn, status, Money snapshot) + booking-status + state machine
- [x] Migration: bookings + **EXCLUDE (gist, tstzrange) double-booking guard** + RLS (reversible)
- [x] 23P01 → 409 `BOOKING_SLOT_TAKEN` mapping in repository
- [x] BookingStateMachine + assertCanTransition (+ UnprocessableStateException 422)
- [x] Transition endpoints (confirm/complete/cancel/no-show) + reschedule, optimistic version lock (409 `STALE_BOOKING`)
- [x] Capability gate (staff canPerform service) + tenant-scoped customer/service checks
- [x] **Concurrency e2e: 10 parallel → exactly 1 wins**, freed-slot rebook, illegal transition (422), stale version (409), cannot-perform (400) — 44 integration green
- [x] state-machine unit tests
- [x] Review fixes: EXCLUDE excludes `deleted_at IS NULL` (soft-deleted active row can't block a slot); reschedule state error → 422.
- Deferred (documented, not blockers): completing/no-showing a *future* booking frees its slot (operator edge — add a time guard in hardening); no per-booking ownership authz (staff-managed model; customer-owns-booking is future); past-dated bookings accepted; no DB CHECK on status enum.

**Slice B — availability (done):**
- [x] AvailabilityService (windows − timeOff − bookings ± buffer; slot slicing; luxon DST-safe local→UTC) — aggregating read service
- [x] pure helpers: `local-time` (localMinutesToUtc, weekdayInZone) + `slot-generator`
- [x] GET /availability + query DTO; filter capable + active staff (skips soft-deleted/inactive)
- [x] DST unit tests (EST/EDT offset) + slot-generator unit tests; e2e (UTC slice + booking removal + NY-timezone offset) — 46 integration green
- Buffer model: existing booking padded by the queried service's buffers on their correct sides (before at start, after at end); documented simplification (booking's own service buffers not loaded). Availability is UX pre-filter; EXCLUDE (no buffer) is the guarantee.
- Review fixes (verified against luxon empirically): **H1 DST bug** — `localMinutesToUtc` used `.plus({minutes})` (absolute minutes) → wall-clock drifted ±1h on transition days; switched to `.set({hour,minute})` (wall-clock, DST-correct). **H2** — added spring-forward/fall-back unit regression tests + day-end minute-1440 test. **M1** — buffer no longer summed+doubled on both sides. **M2** — time-off query bounded (`overlapping(from,to)`) instead of load-all-then-filter. **M3** — `@IsTimeZone` on tenant onboarding + invalid-date → 400.

**Slice C — idempotency + ETag (next):**
- [ ] Idempotency-Key on POST /bookings (entity + helper)
- [ ] ETag / If-Match on reschedule/cancel (from @VersionColumn)

## Success Criteria
- Concurrency test: 20 parallel identical bookings → exactly 1 persists, others 409 `BOOKING_SLOT_TAKEN`.
- Cancelling a booking frees the slot for rebooking (EXCLUDE WHERE clause).
- Illegal transition (e.g. completed→pending) → 422 `INVALID_BOOKING_TRANSITION`.
- Reschedule with stale version → 409 `STALE_BOOKING`.
- DST-boundary bookings map to correct UTC instants.
- Duplicate Idempotency-Key returns identical stored response, no second row.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| EXCLUDE WHERE omits a status → false conflicts or missed | Med×High | Explicit active-status list; test freed-slot rebook |
| DST miscompute | High×High | luxon zone-aware; explicit spring/fall tests; never fixed offsets |
| Idempotency race (two same-key concurrent) | Med×Med | Unique(tenant_id,key) + insert-first pattern; second waits/reads |
| Buffer math off-by-one | Med×Med | TimeRange VO + unit tests around buffer edges |
| 23P01 not caught (driver error shape) | Med×High | Assert on `error.code`; integration test covers real PG error |
| Availability N+1 / slow | Med×Med | Batch-load bookings for window; index (tenant_id,staff_id,starts_at) |

## Security Considerations
- Customer may only book/cancel own bookings; staff/owner scoped to tenant (RBAC + RLS).
- Idempotency keys tenant-scoped (never cross-tenant replay).
- Availability endpoint must not leak other tenants' staff/bookings (RLS).

## Next Steps
- Emits domain events consumed by phase-04 (Outbox → email + webhook). Booking data feeds phase-05 reporting, phase-06 recurring.

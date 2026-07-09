# Code Review — Phase-03 Slice A (Booking Core / Double-Booking Prevention)

- Branch: `develop` · Range: `f17afe9..6fa8cf9`
- Reviewer: code-reviewer · Date: 2026-07-09
- Scope: booking module (entity, status, state-machine, repository, service, controller, DTOs), customer module, staff-service tweaks, migration `1780298800000-BookingsCore`, concurrency e2e. Plan/*.md docs ignored.
- Pre-checked green (trusted): typecheck, lint, unit 16/16, integration 44/44 (incl. 10-parallel concurrency), migration up/down.

## Verdict on the double-booking guarantee

**Airtight at the production DB.** The `bookings_no_overlap` EXCLUDE constraint is correct and complete for the active set:

- `tstzrange("starts_at","ends_at")` is half-open `[start,end)` — adjacent/back-to-back (end == next start) correctly do NOT conflict. Verified against test slots.
- `&&` catches every real overlap: identical, partial, contained, different-length. Concurrency serialised by the GiST exclusion → exactly one of N concurrent inserts wins (23P01 → 409 `BOOKING_SLOT_TAKEN`), rest rejected. Test confirms 1 win / 9 conflicts.
- Self-exclusion means reschedule (`UPDATE starts_at/ends_at`) re-evaluates the constraint against *other* rows only → moving onto a taken slot raises 23P01, moving to a free slot succeeds. Correct.
- `WHERE status IN ('pending','confirmed')` frees cancelled/completed/no_show slots for rebooking. Correct and tested.
- `durationMin >= 1` guarantees `ends_at > starts_at`, so no empty/degenerate range can slip the `&&` check.

No path found where two overlapping *active* bookings both persist. The guarantee holds — subject to the two latent gaps below, neither exploitable in the current surface.

## Findings

### Critical
None.

### High
None. (The two items below are latent, not currently reachable, so ranked Medium.)

### Medium

**M1 — EXCLUDE WHERE omits `deleted_at IS NULL`; soft-deleted bookings become phantom slot-locks.**
`src/database/migrations/1780298800000-BookingsCore.ts:66` — constraint predicate is `WHERE (status IN ('pending','confirmed'))`. Bookings are soft-deletable (`BaseEntity.@DeleteDateColumn`, `src/common/base/entity.base.ts:18`). TypeORM excludes soft-deleted rows from reads, but the physical row still participates in the EXCLUDE. If a `pending`/`confirmed` booking is ever soft-deleted, its slot stays blocked forever while being invisible to the app — a slot that can never be rebooked and never diagnosed via the API.
No soft-delete path is exposed for bookings today (repository has no remove), so **not currently exploitable** — but it is a trap for Slice B and any future "delete booking" feature.
Fix: `WHERE (status IN ('pending','confirmed') AND deleted_at IS NULL)`. Mirror in the manual constraint in `test/integration/booking-concurrency.e2e.spec.ts:24`.

**M2 — Completing/no-showing a *future* booking silently frees its slot → double-sell window.**
`src/modules/booking/booking-state-machine.ts:9-10` allows `confirmed→completed|no_show` and `pending→no_show` with no time guard. Marking a *future* booking completed/no_show drops it out of the active set, so the same slot can be booked again while the customer still holds the original appointment — a genuine double-booking the DB constraint cannot catch (by design, since it's now inactive).
This is an operator-error / trust-boundary edge, not a concurrency defect. Acceptable to defer, but should be a conscious decision.
Fix (optional now, recommended before availability): guard `complete`/`no_show` to bookings whose `ends_at <= now()` (or `starts_at <= now()`), else 422.

### Low

**L1 — Reschedule uses 400 for a state error; inconsistent with the 422 state-machine contract.**
`src/modules/booking/booking.service.ts:70` throws `BadRequestException` ("Only active bookings can be rescheduled"). This is a state-transition rejection, semantically identical to illegal transitions which return 422 via `UnprocessableStateException`. Prefer `UnprocessableStateException` (422) for consistency.

**L2 — No per-booking ownership authorization (known model gap).**
`src/modules/booking/booking.controller.ts:35-63` — any `owner`/`staff` in the tenant can confirm/cancel/complete/reschedule *any* booking. Consistent with the staff-managed model and acceptable for this slice, but customer-owns-booking is unimplemented. Flagging as the expected future gap, not a defect. When customer login lands, add ownership checks on mutation + `GET /:id`.

**L3 — Past-dated bookings accepted.**
`src/modules/booking/dto/create-booking.dto.ts:13` / `booking.service.ts:31` — no "startsAt in future" check. Per scope this is acceptable, but availability (Slice B) will need it; note it so it isn't forgotten.

**L4 — Stale-version test is unrealistic; no concurrent-transition race test.**
`test/integration/booking-concurrency.e2e.spec.ts:133` sends `version + 5` (a version higher than any that can exist). This exercises the `affected = 0` path but not the real scenario: read v, another actor bumps it, retry with old v. Add a test that mutates once then retries with the pre-mutation version. Also, only concurrent *create* is race-tested — no concurrent *transition/reschedule* race test. The optimistic guard is sound (see below), but coverage is thin.

**L5 — Reschedule recomputes `endsAt` from the *current* service duration.**
`src/modules/booking/booking.service.ts:72-74` — if `service.durationMin` changed since creation, rescheduling silently changes the booking's length. Edge case; document intent or snapshot duration on the booking.

**L6 — `status` column is free-form varchar (no DB CHECK / enum).**
`migration:40` — integrity relies entirely on the app + state machine. A `CHECK (status IN (...))` would harden the boundary cheaply. Optional.

## Verified-correct (do not re-flag)

- **Optimistic lock — no `@VersionColumn` conflict.** `applyStatus`/`applyReschedule` use QueryBuilder `.update()` with explicit `version = "version" + 1` (`booking.repository.ts:33,54`). QB updates do NOT trigger TypeORM's automatic version increment (that only fires on `repository.save()`), so there is exactly one increment, no double-bump, no ORM optimistic error. `create` uses `save()` → version initialised to 1, matching migration default. Correct.
- **`version` is a concurrency token, not auth.** A wrong-but-existing version cannot cause a silent wrong update: the `WHERE ... version = :v` matches 0 rows → `affected 0` → `STALE_BOOKING` (409). A client cannot forge a higher version onto a row.
- **Optimistic guard also protects the state machine.** `assertCanTransition` runs on the in-memory (possibly stale) status, but any concurrent change bumps `version`, so the subsequent guarded UPDATE matches 0 rows → STALE. No invalid transition can be committed on stale state. Same protection covers reschedule-after-cancel.
- **Tenant isolation on attach.** `staffId`/`serviceId`/`customerId` from the body are each validated through tenant-scoped services (`ServiceService.getById`, `StaffServiceService.canPerform`, `CustomerService.getById`, all on `BaseTenantRepository`) before insert; the row is stamped with `getTenantId()` and RLS `WITH CHECK` re-asserts it. `applyStatus`/`applyReschedule` also carry an explicit `tenant_id = :tenantId` predicate. No cross-tenant attach vector found.
- **`endsAt` math.** `startsAt.getTime() + durationMin*60000` stored as UTC `timestamptz` — absolute instant, DST-safe. Correct.
- **No N+1.** Create issues a constant 3 lookups + 1 insert; no unbounded loops over DB calls.

## Blockers before Slice B (availability)
- None are hard blockers. Strongly recommend fixing **M1** (`deleted_at IS NULL` in the EXCLUDE) *before* any booking-deletion or availability logic is built on top of the constraint, since availability will query/trust the same active-slot definition. Decide **M2** consciously.

## Unresolved questions
1. Is booking soft-delete planned (M1)? If yes, M1 becomes High before that lands.
2. Is completing/no-showing a future booking a real operator flow, or should it be time-guarded (M2)?
3. Should reschedule preserve the original duration snapshot rather than re-deriving from the live service (L5)?
4. Confirm 422-vs-400 convention for state-rejection errors (L1) — align reschedule accordingly.

**Status:** DONE
**Summary:** Double-booking guarantee is airtight at the DB (correct half-open EXCLUDE, active-status WHERE, self-exclusion, reschedule re-check); optimistic lock and tenant isolation verified correct. Two latent Medium gaps (soft-delete not excluded from EXCLUDE; completing future bookings frees slots) plus minor Low items. No Critical/High.
**Concerns/Blockers:** M1 should be fixed before availability builds on the active-slot definition; otherwise no blockers.

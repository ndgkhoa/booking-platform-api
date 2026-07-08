# Phase 4 — Core booking engine ⭐ (centerpiece)

## Context links
- ADR-0002 (`docs/adr/0002-booking-concurrency-control.md`). Depends on Phase 1–3.
- Reuse: `common/exceptions/app.exception.ts`, `error-handler.middleware.ts` (add `23P01`→409), `test/integration/support/*`.

## Overview
- **Priority:** critical (the differentiator) · **Status:** pending.
- Availability computation + booking creation that is correct under concurrency and safe under retries. This is the phase to over-invest in.

## Key insights
- Three-layer double-booking defense (ADR-0002): app `SELECT … FOR UPDATE` → **DB `EXCLUDE USING gist` (btree_gist)** as source of truth → `Idempotency-Key` for retries.
- Store all times **UTC**; compute availability in the **tenant timezone** (Luxon/date-fns-tz), then convert. Buffer padding both sides of a booking.
- Cancelled / no_show must be excluded from the constraint predicate so freed slots can be rebooked.

## Requirements
- Functional: `GET availability` (service+staff+date → free slots); `POST bookings` (create, conflict-safe); cancel/reschedule with policy; status transitions.
- Non-functional: two concurrent identical bookings → exactly one succeeds; retry with same Idempotency-Key → one booking.

## Architecture
- `Booking` entity: tenant_id, customer_id, staff_id, service_id, start_time/end_time timestamptz, `status` enum (`pending|confirmed|completed|cancelled|no_show`), `idempotency_key` unique nullable, notes, `version` (optimistic), timestamps. Indexes (staff_id,start,end), (tenant_id,status).
- Migration: `CREATE EXTENSION IF NOT EXISTS btree_gist` + `ALTER TABLE bookings ADD CONSTRAINT no_overlap EXCLUDE USING gist (staff_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&) WHERE (status IN ('pending','confirmed'))`.
- `AvailabilityService` — free = workingHours(tenant tz) − timeOffs − activeBookings − buffer; slot granularity from service duration.
- `BookingService.create()` — `withTenantTransaction` → `SELECT … FOR UPDATE` overlapping → insert; catch `23P01` → `BookingConflictException` (409). Idempotency store (Redis or `idempotency_keys` table, TTL).
- `BookingStateMachine` — guarded transitions; `CancellationPolicyService` (cancel window, booking cutoff, no-show marking, buffer).

## Related code files
- **Create:** `modules/booking/{booking.entity,booking.repository,booking.service,booking.controller,availability.service,booking-state-machine,cancellation-policy.service}.ts`, DTOs, migration.
- **Modify:** `common/middlewares/error-handler.middleware.ts` (map `23P01`), `common/exceptions/app.exception.ts` (`BookingConflictException`).

## Implementation steps
1. Booking entity + migration + btree_gist exclusion constraint.
2. AvailabilityService (timezone-aware) + unit tests (slot math, buffer, DST edge).
3. create() transaction: FOR UPDATE + insert + `23P01` mapping.
4. Idempotency-Key handling.
5. State machine + cancellation/no-show policies + cutoff/buffer.
6. Concurrency integration test.

## Todo
- [ ] Booking entity + exclusion-constraint migration
- [ ] AvailabilityService + unit tests
- [ ] create() with FOR UPDATE + 23P01→409
- [ ] Idempotency-Key store
- [ ] State machine + cancellation/no-show policy
- [ ] Concurrency integration test (2 parallel → 1 wins)

## Success criteria
- Unit: availability math (tz, buffer) + transition guards.
- Integration (Testcontainers): fire 2 identical bookings in parallel → exactly one 201, other 409; same Idempotency-Key twice → one booking; cancelled slot rebookable.
- typecheck + lint + all tests green.

## Risks
- `tstzrange` bounds inclusivity (`'[)'`) must match buffer semantics — test adjacency (back-to-back bookings allowed, overlap rejected).
- Optimistic `version` + pessimistic lock interplay — keep FOR UPDATE the primary serializer; version guards reschedule races.

## Security
- Enforce tenant + role on every booking op; customers act only on own bookings; staff/owner scoped to tenant.

## Next
- Phase 5 (recurring + cache) and Phase 6 (outbox events on status change) build on this.

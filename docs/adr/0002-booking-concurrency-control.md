# ADR-0002: Booking concurrency & double-booking prevention

- **Status:** accepted
- **Date:** 2026-07-08

## Context

A booking reserves a staff member for a time range. Two customers (or two retries) can request overlapping slots for the same staff at the same instant. A naïve "check availability, then insert" has a race window: both requests read "free", both insert, and the staff is double-booked. This must be impossible under concurrency, and safe under client retries.

## Decision

**Three layers, from application intent down to a hard database guarantee:**

1. **Pessimistic locking** — the create-booking path runs in a transaction and takes `SELECT … FOR UPDATE` on the staff's overlapping bookings before inserting, serialising concurrent attempts for the same staff.
2. **Database exclusion constraint (source of truth)** — a PostgreSQL `EXCLUDE USING gist` constraint (via the `btree_gist` extension) forbids two active bookings for the same `staff_id` whose `tstzrange(start, end)` overlap. Even if application logic is wrong or bypassed, the database rejects the overlap (SQLSTATE `23P01`), which we map to HTTP 409.
3. **Idempotency** — an `Idempotency-Key` request header is stored so a retried create returns the original result instead of a duplicate booking.

## Alternatives considered

- **Application-only check** — fails under concurrency (race window).
- **`SERIALIZABLE` isolation only** — correct but forces retry-on-serialization-failure handling everywhere and costs more; the exclusion constraint expresses the invariant declaratively and cheaply.
- **Advisory locks keyed by staff** — workable, but the invariant lives in code, not the schema; the exclusion constraint is self-documenting and cannot be forgotten.

## Consequences

- **Positive:** double-booking is structurally impossible; retries are safe; the invariant is enforced by the database and survives any application bug.
- **Trade-offs:** requires the `btree_gist` extension and range-based modelling of booking times; overlapping-insert attempts surface as `23P01` and must be translated to a clean 409; cancelled/no-show statuses must be excluded from the constraint predicate so freed slots can be rebooked.
- **Follow-ups:** migration enabling `btree_gist` + the exclusion constraint; error-handler mapping for `23P01`; a concurrency integration test firing two identical bookings in parallel and asserting exactly one succeeds.

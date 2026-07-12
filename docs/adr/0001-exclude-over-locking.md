# ADR 0001 — EXCLUDE constraint over application locking for double-booking

**Status:** Accepted · **Date:** 2026-07-08

## Context

The core invariant of a booking platform: one staff member cannot hold two
overlapping bookings. Under concurrency, two requests for the same staff and
overlapping times can both pass an application-level "is it free?" check and
both insert — a classic check-then-act race. We need a guarantee that holds no
matter how many requests race, without serialising all booking creation.

## Decision

Enforce non-overlap in the database with a Postgres `EXCLUDE USING gist`
constraint on `bookings`, scoped per tenant and per staff over a time range:

```sql
EXCLUDE USING gist (
  tenant_id WITH =, staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&
) WHERE (status IN ('pending','confirmed') AND deleted_at IS NULL)
```

A conflicting insert fails atomically with SQLSTATE `23P01`, which the
repository maps to HTTP `409`. The check and the write are the same operation, so
there is no race window. `btree_gist` is enabled by a dedicated first migration;
the partial `WHERE` excludes cancelled/soft-deleted rows so they never block.

## Consequences

- **+** Correct under arbitrary concurrency — proven by an integration test and a
  k6 load test where exactly one of N simultaneous identical bookings wins.
- **+** No application locks, no advisory locks, no serialised booking path; the
  DB does overlap detection with a gist index.
- **+** The rule lives in one place (the schema), not spread across services.
- **−** Overlap semantics are fixed to `tstzrange` half-open intervals; richer
  rules (buffers, per-service padding) require expanding the range expression.
- **−** Conflicts surface as an exception to catch and translate, not a boolean.

## Alternatives considered

- **App-level check + row lock (`SELECT … FOR UPDATE`):** must lock a
  representative row or a range; error-prone, and a naive check-then-insert still
  races. More code for a weaker guarantee.
- **Serialisable isolation:** correct but forces retries on serialisation
  failures across the whole booking path; heavier than a targeted constraint.
- **Advisory locks keyed by staff+slot:** works but reinvents range-overlap
  logic in the app and couples correctness to every caller remembering to lock.

# ADR 0004 — Transactional outbox for domain events

**Status:** Accepted · **Date:** 2026-07-09

## Context

State changes (booking created/confirmed/cancelled) must trigger side effects:
emails, signed webhooks to tenant endpoints. Enqueuing a job directly from the
handler is a dual-write — the DB commit and the queue publish can diverge. If the
process dies between them, we either lose the event (committed but not enqueued)
or emit a phantom (enqueued but the transaction rolled back).

## Decision

Write events to an `outbox_events` table **in the same transaction** as the state
change. A separate relay polls unprocessed rows with `FOR UPDATE SKIP LOCKED`,
publishes them to the queue, and marks them processed. Consumers are idempotent
(dedup by a stable job id), giving at-least-once delivery.

```
handler tx:  UPDATE booking …  +  INSERT outbox_events …   (atomic)
relay:       SELECT … FOR UPDATE SKIP LOCKED → enqueue → mark processed
```

## Consequences

- **+** No dual-write: the event is committed atomically with the change, or not
  at all. A crash can never lose or fabricate an event.
- **+** `SKIP LOCKED` lets multiple relay workers share the backlog without
  double-processing a row.
- **+** At-least-once + consumer idempotency is simpler and safer than chasing
  exactly-once across a DB and a broker.
- **−** Events are eventually, not instantly, delivered (poll interval latency).
- **−** An extra table, a relay process, and metrics on outbox lag to operate.
- **−** Duplicates are possible by design, so every consumer must dedup.

## Alternatives considered

- **Enqueue directly in the handler:** the dual-write problem above — lost or
  phantom events on failure between commit and publish.
- **Listen/notify or CDC (logical decoding):** lower latency but more moving
  parts and operational surface than a polled outbox; unnecessary at this scale.
- **Two-phase commit across DB and broker:** heavy, poorly supported, and still
  fragile; industry consensus favours the outbox.

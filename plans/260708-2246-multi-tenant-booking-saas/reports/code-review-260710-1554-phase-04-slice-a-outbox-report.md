# Code Review — Phase-04 Slice A: Transactional Outbox (booking events)

Commit `1114970` on `develop`. Read-only review. Green: typecheck, lint, unit 23/23, integration 53/53.

## Verdict
Solid slice. The two hardest questions — (a) atomicity of the outbox write and (b) SKIP LOCKED double-dispatch — are both **correct**. No Critical issues. No hard blockers for Slice B, but two items (consumer idempotency/jobId, shutdown drain) should be closed before or with Slice B when a real email handler lands.

---

## Focus-area conclusions (the two that matter most)

### (a) Atomicity — VERIFIED correct, one latent trap
`OutboxRepository.record()` uses `getTenantManager() ?? this.dataSource.manager` (`outbox.repository.ts:26`). Traced every `runWithTenant` caller:
- `tenant-context.middleware.ts:80` — always passes `manager: queryRunner.manager`.
- `tenant-transaction.ts:23` — always passes `manager`.

There is **no** code path that sets `tenantId` without a `manager`. So inside any booking request `getTenantManager()` returns the request tx manager → outbox insert rides the same transaction as the booking write. On rollback (e.g. 23P01 → 409) the event is never committed. e2e `outbox.e2e.spec.ts:107-111` proves this.

The autocommit fallback is only reachable with **no** tenant context, and in that case `getTenantId()` (`outbox.repository.ts:28`) throws `UnauthorizedException` *before* any save — so no orphan event is ever written on an autocommit connection today. Idempotency path is also atomic: `doCreate` (booking insert + `emit`) runs inside `idempotency.run` → inside the request tx; the `claim` INSERT…ON CONFLICT, booking insert, and outbox insert are one unit. Confirmed.

→ See **M3** for the residual trap in that `??` fallback.

### (b) SKIP LOCKED — VERIFIED no double-dispatch
`claimBatch` (`outbox.repository.ts:35-46`) issues `FOR UPDATE SKIP LOCKED` (`pessimistic_write` + `skip_locked`) inside `processBatch`'s `dataSource.transaction` (`outbox-relay.service.ts:28`). Locks are held until commit; `markDispatched` flips status in the *same* tx before commit, so a concurrent relay both skips locked rows and never sees them as pending afterward. Two relays get disjoint sets. `available_at <= now()` evaluates server-side. e2e drains cross-tenant and asserts 0 pending / >0 dispatched (`outbox.e2e.spec.ts:126-145`).

The residual is the inherent **at-least-once** boundary: `dispatch` enqueues to BullMQ (non-transactional) inside the DB tx; a crash after enqueue but before commit re-delivers. That is the documented contract (`outbox-relay.service.ts:12-17`) — see **H1** for the consumer-side gap.

---

## Findings by severity

### Critical
None.

### High

**H1 — At-least-once delivery has no idempotent/deduped consumer yet; `enqueueBookingEmail` sets no deterministic `jobId`.**
`outbox-relay.worker.ts:11-20` → `email.queue.ts:49-51` adds the job with random id. Combined with the outbox's documented at-least-once redelivery, a re-dispatched event produces a **second** email job, and the email worker (`email.worker.ts:9-14`) just logs — not idempotent. Fine as a Slice-A stub, but a concrete gap to close with the real handler.
Fix (cheap partial mitigation now): pass `jobId: event.id` so BullMQ dedupes redeliveries while the job is retained:
```ts
emailQueue.add('booking', { type: 'booking', ...data }, { ...JOB_OPTIONS, jobId: event.id });
```
Note `removeOnComplete: true` limits the dedupe window, so Slice B's handler must still be idempotent (dedupe on `(eventType, bookingId)` or an event-id ledger). **Track as Slice-B acceptance criterion.**

**H2 — Graceful shutdown does not await the in-flight relay tick; `AppDataSource.destroy()` can run mid-transaction.**
`worker.ts:20-27` calls `stopRelay()` (clears the interval only) then `AppDataSource.destroy()`. An in-flight `tick()`/`processBatch` keeps running (its drain loop `while (processed > 0)` has no stop signal — `outbox-relay.worker.ts:32-34`). Destroying the pool under an open transaction aborts it; work already `dispatch`-ed in that batch rolls back → redelivered next boot (duplicates), and the abort surfaces as a logged error.
Fix: have `startOutboxRelay` expose an async stop that flips a `stopped` flag (checked in the drain loop) and awaits the current tick's promise; `await stopRelay()` before `AppDataSource.destroy()`.

### Medium

**M1 — Dispatch runs inside the claim transaction across up to 20 sequential Redis round-trips.**
`outbox-relay.service.ts:31-40` awaits `dispatch(event)` (a Redis enqueue) for each row while holding the row locks and a pooled DB connection. Batch of 20 = up to 20 network round-trips per open transaction. Under load this lengthens lock-hold and connection occupancy. It's a deliberate trade-off (keeps delivery inside the claim), so acceptable for Slice A — note it and revisit if relay throughput/pool pressure shows up. Lower `DEFAULT_BATCH` or move dispatch after commit (changes semantics) if needed.

**M2 — Claim index is not partial; table has no cleanup.**
`IDX_outbox_events_dispatch (status, available_at)` (`1780299000000-OutboxEvents.ts:28-30`). Since dispatched/dead rows are never pruned (cleanup deferred to a later slice), the index and heap accumulate all history while the claim only ever wants `status='pending'`. A partial index is markedly cheaper long-term:
```sql
CREATE INDEX "IDX_outbox_events_pending" ON "outbox_events" ("available_at")
  WHERE status = 'pending';
```
Confirm cleanup/retention is on the Slice-B/phase-08 backlog.

**M3 — `?? this.dataSource.manager` autocommit fallback is a latent atomicity trap.**
`outbox.repository.ts:26`. Safe *today* only because `getTenantId()` throws first when no context exists. But it silently breaks the outbox guarantee the moment any future caller stamps `tenantId` explicitly, or `getTenantId` is relaxed to return a value without a manager — the event would commit on an autocommit connection, decoupled from the aggregate write, with no test catching it. Recommend failing fast instead:
```ts
const manager = getTenantManager();
if (!manager) throw new Error('OutboxRepository.record requires an active tenant transaction');
```
This makes the atomicity invariant explicit rather than incidental.

### Low

- **L1 — `ORDER BY created_at` has no tiebreaker** (`outbox.repository.ts:41`). Ordering among same-microsecond rows is non-deterministic. Not a correctness issue (all due rows drain); add `, e.id` if strict FIFO is ever required.
- **L2 — Untyped payload access** (`outbox-relay.worker.ts:16-17`). `String(event.payload.bookingId)` on `Record<string, unknown>` yields `"undefined"` if the shape drifts. `emit()` always populates it today; a typed payload per `aggregateType` would restore compile safety.
- **L3 — `markDispatched`/`markFailed` return `Promise<unknown>`** (`outbox.repository.ts:48,53`). Tighten to `Promise<void>` (return nothing) for clearer contracts.
- **L4 — Double shutdown** (`worker.ts:29-30`). SIGINT+SIGTERM (or repeated signal) can invoke `shutdown` twice → double `destroy()`/`quit()`. Add an idempotent guard flag.
- **L5 — `markFailed` throwing aborts the whole batch tx** → rolls back already-dispatched rows in the batch → redelivery. Edge case (DB error during the failure update); covered by the at-least-once contract, no action needed beyond awareness.

---

## Backoff / dead-letter check (Focus 3) — correct
`attempts` default 0; each failure computes `event.attempts + 1`. Failures 1→30s, 2→60s, 3→120s, 4→240s, then when stored `attempts` is 4 the next failure makes `attempts=5 >= MAX_ATTEMPTS` → `dead` (`outbox.repository.ts:54-61`). 5 delivery attempts total, no off-by-one. Per-event try/catch (`outbox-relay.service.ts:32-39`) keeps one failure from aborting the batch. Correct.

## Positive observations
- Atomicity invariant holds and is proven by e2e (rollback → zero events).
- SKIP LOCKED claim + in-tx status flip is the textbook-correct concurrent-relay pattern.
- Injected `OutboxDispatch` keeps the relay Redis-free and unit-testable.
- Reentrancy `running` guard on the poll tick; per-event isolation in the batch.
- Clear, honest comments documenting the at-least-once contract and the non-RLS design.
- Migration reversible; FK CASCADE and non-RLS choice documented.

## Metrics
- Files reviewed: 13 (diff). New LOC ~470.
- `any`: none introduced. Type coverage: good (one `Record<string, unknown>` payload — L2).
- Lint/typecheck/tests: green as reported.

## Blockers before Slice B
1. **H1** — real email handler must be idempotent; add `jobId: event.id` now as partial dedupe. (Acceptance criterion for Slice B.)
2. **H2** — make relay shutdown await the in-flight tick before `AppDataSource.destroy()`.
(Both are pre-conditions for correctness once a *real* side effect replaces the log stub. M2/M3 are strong-recommend, not blocking.)

## Unresolved questions
1. `package.json` pins `typeorm: ^1.0.0` — confirm this is the intended (private/forked?) build; `setOnLocked`/`skip_locked` works in tests, so noting only.
2. Is outbox retention/cleanup formally scheduled for Slice B or phase-08? Confirm so M2 partial index + pruning land together.
3. Intended dedupe key for the eventual email consumer — event `id`, or `(eventType, bookingId)`? Affects whether redelivered *distinct* status-change events must stay distinct.

---
**Status:** DONE
**Summary:** Outbox core is correct on both hard guarantees (atomic write, no SKIP-LOCKED double-dispatch); no Critical/blocking bugs. 2 High (consumer idempotency + jobId; shutdown drain), 3 Medium (long tx, partial index, autocommit-fallback trap), 5 Low.
**Concerns/Blockers:** H1 and H2 should close before/with Slice B's real email handler; otherwise at-least-once redelivery yields duplicate emails and unclean shutdown can drop/duplicate in-flight batches.

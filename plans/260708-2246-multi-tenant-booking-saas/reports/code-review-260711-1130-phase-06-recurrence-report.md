# Code Review — Phase-06 Recurring Bookings

Commit `811e271` on `develop`. Read-only review. Scope: recurrence module, booking.service/repository additions, migration. Plan/*.md ignored.

Green baseline confirmed (typecheck/lint/unit35/int67 per task). No Critical defects.

## Verdict
SAVEPOINT lifecycle and rollback semantics are **correct** (verified below). One **High** event-model gap should be decided before Phase 07. Rest are Medium/Low polish.

---

## Critical
None. No double-booking bypass (each occurrence is a normal EXCLUDE-guarded insert), no tenant leak, no SQL injection (savepoint name is numeric `i` from `.entries()`), no external side effect inside the tx loop.

---

## High

### H1 — `cancelFutureSeries` emits no outbox events and bypasses the state machine
`booking.repository.ts:28-42`, `booking.service.ts:121-123`

Single-booking cancel (`transition`, `booking.service.ts:175-185`) does `assertCanTransition` + optimistic version check + `emit(updated, 'booking.cancelled')`. The bulk series cancel does a raw `UPDATE ... SET status='cancelled'` and emits **nothing**.

Impact: the outbox relay (`outbox-relay.service.ts`) is the at-least-once feed for all downstream consumers (webhooks/notifications/read-model projections). After a series cancel, the DB rows are `cancelled` but no `booking.cancelled` event is ever published — every consumer keeps those occurrences as active indefinitely. This is a real event-stream divergence, not cosmetic. The single-cancel path deliberately emits per booking; the series path silently doesn't, so behavior is inconsistent for the same logical operation.

Fix (pick one):
- Fetch the affected occurrences (SELECT ... FOR UPDATE the future-active rows for the series), transition each through the normal path so each emits `booking.cancelled`; or
- Keep the bulk UPDATE for efficiency but, in the same tx, insert one outbox row per cancelled booking id (RETURNING id from the UPDATE → loop `emit`). `UPDATE ... RETURNING id` keeps it a single round-trip for the status change.

Note the state-machine bypass is acceptable *only* if all future-active statuses (pending/confirmed) can legally reach cancelled — they can here — but the missing events are the load-bearing issue.

---

## Medium

### M1 — `MAX_SCAN_DAYS=800` silently truncates weekly series before reaching `count`
`recurrence-expander.ts:18,73`

Weekly expansion scans day-by-day capped at 800 days. For `interval ≥ 2` this caps out before `count` is reached: e.g. weekly `interval=2`, one weekday, `count=100` needs ~1400 days but stops at ~57 occurrences. The caller asked for 100, gets ~57, with **no error and no log** — the series just ends early. DTO allows `interval ≤ 52` × `count ≤ 100`, so this is reachable via the API.

Fix: derive the scan bound from the request (e.g. `interval * 7 * count + 7`, still hard-capped), or when the loop exits on `scanned >= MAX_SCAN_DAYS` while `out.length < limit`, surface it (throw `BadRequestException('recurrence horizon too long — narrow count/interval or set until')`) instead of returning a silently-short list.

### M2 — Up to 100 EXCLUDE-locked inserts held for the whole request transaction
`recurrence.service.ts:79-135`

With neither `count` nor `until`, expansion runs to `MAX_OCCURRENCES=100`; all 100 inserts + 100 outbox rows + up to 100 savepoints live in one HTTP-request transaction, holding row locks / EXCLUDE conflicts for the request's full duration. Fine for correctness (bounded), but a slow/contended request blocks concurrent bookings for the same staff across a wide time range. Acceptable for now given the 100 cap; flag for a future async/chunked path if series sizes grow. Consider documenting the max-100-per-request cost.

---

## Low

### L1 — skip_conflicts never RELEASEs the savepoint on the conflict path
`recurrence.service.ts:129-133`

On catch it runs `ROLLBACK TO SAVEPOINT occ_i` but not `RELEASE SAVEPOINT occ_i`. Postgres keeps the savepoint defined after rollback-to, so up to 100 un-released savepoints accumulate per tx. Harmless at N ≤ 100 (no correctness or leak issue — verified savepoint + insert run on the same query-runner connection via `runInTenantContext`), but tidier to `RELEASE SAVEPOINT ${sp}` after the rollback to free server-side state.

### L2 — Weekly week-0 weekdays before the start weekday are silently dropped
`recurrence-expander.ts:72`

`cursor` starts at `start`, so for start=Wed with `weekdays=[Mon,Wed]`, Monday of the start week is skipped (it precedes `start`). Intended (can't book in the past relative to start), but undocumented for API consumers who may expect the first full week. Add a doc line on the DTO/endpoint.

### L3 — `weekdays` silently ignored for `freq='daily'`
`create-recurrence.dto.ts:32-38`, `recurrence-expander.ts:41-43`

Daily expansion never reads `weekdays`. A caller passing both gets silent no-op. Either reject at the DTO (validate `weekdays` only with `weekly`) or document it as ignored.

### L4 — Recurrence row persisted even when 0 occurrences are created
`recurrence.service.ts:54-85`

If every occurrence conflicts (skip_conflicts), the recurrence row is committed with zero linked bookings — an orphan definition. Acceptable (series can be re-expanded / is a record of intent), but note it; consider returning it clearly so the client knows nothing was booked (`created: []`).

### L5 — String literal instead of const
`booking.repository.ts:33` — `set({ status: 'cancelled' })` should be `BookingStatus.Cancelled` for consistency with the rest of the module (and to survive any future enum-value change).

### L6 — Cancel of unknown/foreign recurrence id returns `{cancelled: 0}`, not 404
`recurrence.controller.ts:19-24`, `booking.repository.ts:34` — tenant-scoped WHERE means no cross-tenant leak (correct), but a non-existent id is indistinguishable from a series with no future occurrences. Minor; acceptable if intentional (idempotent cancel).

---

## Verified-correct (do not re-flag)
- SAVEPOINT and the occurrence INSERT run on the **same** connection: `getTenantManager()` returns the `dataSource.transaction` manager (`tenant-transaction.ts:21-24`) and `BaseTenantRepository.repo` resolves to that same manager (`tenant-repository.base.ts:37-40`). So `ROLLBACK TO SAVEPOINT` correctly undoes only that occurrence's insert+outbox row.
- Per-occurrence isolation: rolling back occurrence *j* does not touch occurrences `< j` (each has its own savepoint) — earlier created bookings + their `booking.created` outbox rows are preserved. Confirmed against the outbox-atomicity design.
- all_or_nothing: emits then lets the 409 propagate → whole request tx rolls back → both bookings and their outbox rows vanish together. Atomic, no half-emitted state.
- No non-DB side effect in the loop: `createOccurrence` only writes booking + outbox rows; BullMQ dispatch happens later from the relay. Savepoint rollback fully reverses a skipped occurrence.
- `createOccurrence` calls the repository `create` (not the idempotency-wrapped service `create`), so no idempotency-key interference. Correct.
- DST: `.set({hour,minute})` anchoring + calendar `.plus({days})` keep wall-clock constant across DST; `toUTC()` at emit. `until = endOf('day')` inclusive is correct. `weekIndex` is always ≥ 0 (cursor ≥ start ⇒ `cursor.startOf('week') ≥ anchorWeek`), so week-0 `weekIndex % interval === 0` always fires — first occurrence included.
- RLS enabled + FORCED on `recurrences` with tenant_isolation policy; migration reversible; FK `ON DELETE SET NULL` on `bookings.recurrence_id`. Correct.
- Cross-module access goes through services (`services`, `capabilities`, `customers`, `tenants`), not repositories. Layering respected.

---

## Blockers before Phase 07
- **H1** is the one to decide: if any Phase-07 (or existing) consumer reacts to `booking.cancelled` (webhooks, notifications, projections), the series-cancel event gap must be closed first, else those consumers silently diverge. Not a code-correctness blocker, but an event-contract one.

## Unresolved questions
1. H1: is emitting per-occurrence `booking.cancelled` on series cancel required, or is series cancellation intended to be a separate event type (e.g. `recurrence.cancelled`) that consumers subscribe to instead? Design decision needed.
2. M1: is silent short-return on a too-long weekly horizon acceptable product behavior, or should the API reject? (User-facing expectation of `count`.)
3. Is the 100-occurrence single-transaction ceiling the intended long-term model, or a placeholder before an async expansion job?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** SAVEPOINT/rollback correctness verified sound; no Critical/injection/tenant-leak issues. One High event-model gap (series cancel emits no outbox events + bypasses state machine) and one Medium silent-truncation bug (MAX_SCAN_DAYS vs count for weekly interval≥2), plus Low polish.
**Concerns/Blockers:** H1 (missing `booking.cancelled` events on series cancel) should be resolved or explicitly deferred before Phase 07 event consumers rely on it.

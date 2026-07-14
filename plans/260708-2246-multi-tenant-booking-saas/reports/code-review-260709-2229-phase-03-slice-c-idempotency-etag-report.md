# Code Review — Phase-03 Slice C: Idempotency-Key + ETag/If-Match

**Reviewer:** code-reviewer | **Date:** 2026-07-09 | **Branch:** develop
**Range:** `03cb551..de4ea3b` (code only; plan/*.md ignored)
**Verdict:** No Critical/High blockers. The concurrency crux is CORRECT. Ship-able into Phase 04 with the Medium items tracked.

---

## Scope
- `src/common/idempotency/*` (entity, repository, service)
- `src/database/migrations/1780298900000-IdempotencyKeys.ts`
- `src/modules/booking/{booking.controller,booking.service}.ts`, `dto/reschedule-booking.dto.ts`
- `src/common/exceptions/*` (PreconditionFailedException)
- tests: `booking-idempotency.e2e.spec.ts`, harness wiring

---

## Crux verified: concurrent same-key semantics are CORRECT

Traced A/B same-key under the per-request transaction (READ COMMITTED — `startTransaction()` no isolation arg, `tenant-context.middleware.ts:57`):

- claim = `INSERT ... ON CONFLICT DO NOTHING RETURNING id` (`idempotency.repository.ts:19-29`). Against a **concurrent uncommitted** conflicting unique row, Postgres **blocks** the inserter until the other tx resolves — it does NOT return immediately. Verified behavior.
- **A commits (happy path):** A's claim+operation+complete all commit atomically (one tx, committed by `TenantTransactionInterceptor` before serialization). B's claim unblocks → conflict now committed → `DO NOTHING` → `RETURNING` empty → `claim` returns `null` → `replay()` → `findByKey` (READ COMMITTED fresh snapshot) sees A's committed row **with `response_body` already populated** → replays. Correct.
- **A rolls back (23P01/500):** operation throws → `complete` never runs → interceptor never commits → middleware `res.on('finish'|'close')` rollback removes A's idempotency row. B's claim unblocks → no conflict → INSERT succeeds → B owns the key and re-runs. Correct — failures are intentionally not memoized.

**The `response_body IS NULL` "in progress" 409 branch (`idempotency.service.ts:42-44`) is effectively unreachable in this single-transaction design** — a committed row always has `response_body` set because claim+complete are atomic, and `claim` blocks (never returns null) while the first tx is still open. It is harmless defensive code today; it would only become reachable if the claim were ever committed in a separate transaction from the operation. Not a bug — noted so a future refactor keeps this invariant in mind.

Confirmed the `Promise.all` concurrent e2e (spec:117-134) and the rollback path are consistent with the above.

---

## Findings

### Critical
None.

### High
None.

### Medium

**M1 — Replay bypasses class-transformer; latent data-exposure / shape-drift.**
`idempotency.repository.ts:35-44` stores `JSON.stringify(result)` where `result` is the raw `Booking` entity, captured *before* routing-controllers' `classTransformer: true` (`server.ts:35`) runs `instanceToPlain`. The fresh (first) response IS class-transformed; the replayed response is the raw stored JSON. Today they match because `Booking`/`BaseEntity`/`BaseTenantEntity` carry **no** `@Exclude`/`@Transform` (only `user.entity.ts:14` has `@Exclude`, unrelated). But the moment anyone adds an `@Exclude` field to `Booking` (e.g. internal cost, notes), fresh responses would hide it while **replays would leak it** — a silent trust-boundary divergence.
*Fix:* store the serialized/transformed representation, not the raw entity — e.g. `complete(id, instanceToPlain(result))`, or capture the response after the interceptor. Cheapest guard now: add a test asserting `replay.body.data` deep-equals `first.body.data` (see M3) so drift fails loudly.

**M2 — No retention/cleanup on `idempotency_keys`; unbounded growth.**
`1780298900000-IdempotencyKeys.ts` — one row per (tenant, key) forever, `response_body` holds a full booking JSON. A client looping unique keys grows the table without bound; no TTL, no sweep job, no `created_at` retention index. Over time this bloats the tenant table and its unique index.
*Fix:* add a retention policy — periodic `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24h'` (or 7d) via a scheduled job, and/or document the TTL. Consider an index on `created_at` to keep the sweep cheap. Not a Phase-03 blocker but must be tracked before production.

**M3 — Replay test asserts only `id`; won't catch M1 drift.**
`booking-idempotency.e2e.spec.ts:97` checks `replay.body.data.id === first.body.data.id` only. Date/field drift between fresh vs replayed body is invisible.
*Fix:* `expect(replay.body).toEqual(first.body)`. Also the concurrent test (spec:129-133) accepts "≥1 got 201, all share one id" — it does not assert exactly one *real* insert vs replays; acceptable, but a stronger assertion (row count in `bookings` == 1) would pin the dedup guarantee.

### Low

**L1 — Malformed / `*` `If-Match` silently falls back to body version.**
`booking.controller.ts:23-27` + `booking.service.ts:91`. `If-Match: garbage` or `If-Match: *` → `parseIfMatch` returns `undefined` → falls back to `dto.version`. A client that *intended* a precondition but sent a malformed validator could have an update applied against the body version instead of being rejected. Per RFC 7232 a present-but-unusable `If-Match` should not be silently dropped.
*Fix:* if the header is present but unparseable, throw 400 (or 412) rather than falling through. `*` handling optional.

**L2 — Reused-key-different-body returns 409; plan earlier specified 422.**
`idempotency.service.ts:40` throws `ConflictException` (409). Plan history called this 422; the IETF Idempotency-Key draft recommends 422 for key-reuse-with-different-payload. This is a deliberate code choice, not a defect — flagging only to confirm the 409 decision is intentional and to align the plan text. Do not change without confirmation.

**L3 — No length/format validation on `Idempotency-Key` header.**
`booking.controller.ts:37` reads the header into an unbounded `varchar` (`request_hash`/`key` columns are unbounded `character varying`). A 100KB key header is accepted and stored. Empty string is safely treated as "no key" (`!key`, service:22).
*Fix:* cap key length (e.g. reject > 255 chars) at the controller; optionally constrain the column.

**L4 — `complete()` UPDATE is tenant-scoped only by RLS, not Layer-1.**
`idempotency.repository.ts:38-44` uses a raw QueryBuilder `where('id = :id')`, bypassing `BaseTenantRepository.scopedWhere`. Safe here (id is a same-tx-claimed UUID PK; RLS `WITH CHECK` covers it), but it diverges from the repo's two-layer pattern. Acceptable; note for consistency.

**L5 — Unsafe casts.** `result as Record<string, unknown>` (service:33), `existing.responseBody as T` (service:45). Pragmatic given jsonb is untyped; acceptable. No action required.

**L6 — Blocked claim holds a pooled connection while waiting.**
Under high same-key concurrency, waiters block on the unique index while holding their own pooled connection; if the wait exceeds `statement_timeout`, the claim errors → tx aborts → 500. Bounded/acceptable degradation, but worth awareness if same-key storms are expected.

**L7 — `@HttpCode(201)` on idempotent replay.** `booking.controller.ts:34-38` — replay of a creation returns 201. Defensible (idempotent create). Informational; 200 is an alternative some APIs prefer.

---

## Positive observations
- `ON CONFLICT DO NOTHING` (not caught 23505) correctly avoids poisoning the request transaction — matches the established design.
- jsonb write is parameterized (`setParameter('body', ...)`), injection-safe, correct `CAST(:body AS jsonb)`.
- Idempotency table is tenant-scoped with RLS FORCEd + `UNIQUE(tenant_id, key)`; cross-tenant replay impossible (`findByKey` runs through the tenant-scoped repo). `request_hash` correctly guards body-swap under a reused key.
- ETag/If-Match: `@Res()` sets the header while returning the entity, so the ResponseInterceptor envelope AND the ETag header both survive (verified by spec:145). Strong validator `"<version>"` is fine for optimistic concurrency.
- `hashBody` over the class-validated DTO instance (stable property order from `plainToClass`) makes the hash resilient to incoming JSON key-order differences.

---

## Blockers before Phase 04
None. Recommend tracking **M1** (serializer bypass) and **M2** (retention) as follow-ups; both are latent/operational, not correctness blockers for the current entity set.

## Unresolved questions
1. **L2:** Is 409 (vs plan's 422) the intended status for reused-key-different-body? Confirm so plan + code align.
2. **M2:** What retention window for `idempotency_keys` (24h? 7d?) and who owns the sweep job?
3. **L1:** Should a present-but-malformed `If-Match` 400 rather than fall back to body version?

---

**Status:** DONE
**Summary:** Reviewed Slice C; concurrency crux (ON CONFLICT DO NOTHING blocks on uncommitted conflict → correct replay/rollback under one READ COMMITTED tx) verified correct. No Critical/High. 3 Medium (serializer-bypass drift, no TTL, weak replay test), 7 Low. No Phase-04 blockers.
**Concerns:** M1 latent data-exposure if `@Exclude` added to Booking; M2 unbounded table growth.

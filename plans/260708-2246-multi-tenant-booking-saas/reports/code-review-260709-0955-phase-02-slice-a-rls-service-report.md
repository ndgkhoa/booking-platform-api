# Code Review — Phase-02 Slice A (RLS execution model + Service catalog)

Range `344df22..11f2124` on `develop`. Read-only. Focus: correctness/security/design beyond green tests.

## Verdict on the per-request-transaction middleware
**Needs rework before it is the write path for anything that matters.** The isolation model (RLS + SET LOCAL + scoped manager) is sound and fail-closed. The *commit timing* is not production-safe: commit runs on `res 'finish'`, i.e. AFTER the status+body are already flushed to the client. A failed commit then leaves the client holding a 201/200 for data that rolled back, and it breaks read-your-writes. This is the flagship piece, so treat it as a blocker for Slice B write paths. Read-only isolation is fine to keep.

---

## Critical

### C1 — Commit happens after the response is sent (silent data loss / client misled)
`src/common/middlewares/tenant-context.middleware.ts:74`
`res.on('finish', () => void settle(res.statusCode < 400))`. `finish` fires once the response is fully flushed. `settle(true)` then calls `commitTransaction()` asynchronously. If the commit fails (deadlock, serialization, `statement_timeout`, connection drop, disk full, deferred-constraint), the client already received `201 Created`/`200 OK` but the row does not exist. The error is only logged (line 69), never surfaced.
Secondary effect: read-your-writes is broken — a client that POSTs then immediately GETs (new request → new connection → new tx) can miss its own just-written row because the commit may not have landed. The passing `create → read` e2e only works because commit is fast; it is a latent flake and proves the window is real.
**Fix:** commit *inside* the action pipeline, before the body is serialized. Cleanest in this stack: a routing-controllers `@Interceptor`/afterware that, once the controller returns a value, commits the request tx and — on commit failure — throws so `ErrorHandler` emits 500 before anything is flushed. Keep `res.on('finish'/'close')` only as a safety-net *rollback* for paths that never reached the commit point. Do not commit off a `finish` listener.

---

## High

### H1 — Connection leak when tx setup throws before listeners are attached
`src/common/middlewares/tenant-context.middleware.ts:53-56`
`createQueryRunner()/connect()/startTransaction()/set_config` run with no try/catch, and the `finish`/`close` listeners that call `release()` are only registered afterwards (74-75). If `connect()`, `startTransaction()`, or the `set_config` query rejects (DB blip, pool timeout, tenant GUC error), the promise from `use()` rejects → routing-controllers routes to the error handler, but the `queryRunner` created at line 53 is **never released** → a pooled connection leaks per failure. Repeated under DB stress → pool exhaustion → full outage.
**Fix:** wrap setup in try/catch; on failure `await queryRunner.release()` (guard for the not-yet-connected case) then propagate the error. Only attach the settle listeners after setup succeeds.
(Note: with current routing-controllers the rejected `use()` promise is caught, so the request 500s rather than hangs — but the leak occurs regardless. Verify this still holds if the lib is upgraded.)

### H2 — Whole-request connection pinning + unbounded hold time → pool exhaustion / DoS
`src/config/data-source.ts` (no pool sizing → TypeORM default max 10) + middleware design.
Every authenticated tenant request holds one pooled connection for its entire lifetime, including slow controllers and any downstream I/O. Above ~10 concurrent tenant requests, new requests queue on the pool → latency spikes/timeouts. No `idle_in_transaction_session_timeout` or `statement_timeout` is set, so a hung handler holds an **open transaction** indefinitely — pinning a connection, holding row locks, and blocking autovacuum. The trade-off is documented in the JSDoc but not bounded.
**Fix:** set an explicit pool size in `data-source.ts` (`extra: { max, idleTimeoutMillis }`), set `statement_timeout` and `idle_in_transaction_session_timeout` on the app role/connection, and minimise the held window (couples with C1 — commit-in-pipeline shortens the transaction). Load-test at pool-max concurrency.

---

## Medium

### M1 — Lost update in `ServiceRepository.update` (read-modify-write, all columns)
`src/modules/service/service.repository.ts:29-33`
`save(Object.assign(existing, data))` re-writes *every* column from the value loaded at read time. Two concurrent PATCHes on the same service (each changing different fields) → the later commit overwrites the earlier one's field with its stale loaded value. Classic lost update; per-request transactions don't help (no row lock, READ COMMITTED).
**Fix:** update only the provided columns via `repo.update(scopedWhere({id}), data)` / QueryBuilder, or add an optimistic `@VersionColumn`, or `SELECT … FOR UPDATE` before save. (Tenant/id overwrite is *not* a risk here — DTOs are whitelisted and carry neither field — but narrowing the write also closes that door permanently.)

### M2 — No runtime guard that the production DB role is non-superuser / non-BYPASSRLS
`src/config/data-source.ts`, migration `1780298600000-Services.ts:31-42`
RLS silently no-ops for superusers and `BYPASSRLS` roles (FORCE covers the table-owner case only). The caveat is documented, but nothing prevents shipping with `DB_USER` = superuser, in which case Layer-2 is inert and only the app filter protects tenants — with zero signal. Enforcement is proven only in tests via `SET ROLE`.
**Fix:** at boot in production, assert `SELECT current_setting('is_superuser') = 'off'` and `rolbypassrls = false` for the connection role; refuse to start (or loudly warn) otherwise.

### M3 — Money arithmetic can silently exceed safe-integer range
`src/common/value-objects/money.ts:22-32`
`add`/`multiply` construct `new Money(...)` without checking the *result* stays a safe integer. `Number.isInteger` is true well past `2^53`, where precision is already lost — for money this is a correctness bug, not cosmetic.
**Fix:** assert `Number.isSafeInteger(result)` in `add`/`multiply` and throw on overflow.

---

## Low

- **L1** `service.controller.ts:35,29` — `getById`/`list` return the entity directly, exposing internal columns (`tenant_id`, `deleted_at`, `created_at/updated_at`) to clients. Own-tenant data so low sensitivity; consider a response shape/serializer for API stability.
- **L2** `money.ts:12` — currency isn't validated as a 3-letter ISO code at the VO boundary (only enforced at the DTO). VOs are meant to be self-guarding; add a length/format check.
- **L3** `time-range.ts` — no `equals`; `Money` has `equals` but `TimeRange` doesn't. Fine under YAGNI, but the focus area asked: equality semantics are absent, not wrong.

---

## Correctly done (verified, do not revisit)
- RLS **fails closed**: `current_setting('app.tenant_id', true)` → NULL when unset (missing_ok), `NULL::uuid` = NULL, `tenant_id = NULL` yields no rows and does **not** error. Confirmed correct.
- `WITH CHECK` present → blocks cross-tenant INSERT/UPDATE; `ENABLE` + `FORCE` both set (owner subject to RLS).
- `persist` stamps `tenantId` from context, never the caller (`tenant-repository.base.ts:67`); `scopedWhere` correctly re-applies the tenant filter to every branch of an array `where` (48-51).
- `next()` is called exactly once on all four token paths (no-token / bad-token / no-tenant / tenant). `settled` guard is set synchronously before the first await, so the `finish`→`close` double-fire is safely idempotent.
- DTO whitelist + `forbidNonWhitelisted` (`server.ts:35`) blocks `tenant_id`/`id` injection through create/update bodies.
- invite/refresh/onboarding on plain repositories is fine: those tables are not RLS-enabled in this slice, so the fallback-connection "zero rows under FORCE" hazard doesn't touch them. Only future `services` reads outside a tenant tx would silently return nothing (documented in `tenant-repository.base.ts:30-36`).
- `ServiceCatalog` naming (avoids `ServiceService` collision) is reasonable and reads well.
- Docs (`code-standards.md`) accurately describe the model, including the superuser caveat.

---

## Blockers before Slice B
1. **C1** — re-architect commit to land before the response flushes. Everything in Slice B that writes inherits this flaw otherwise.
2. **H1** — release the queryRunner on setup failure.
3. **H2** — bound pool size + transaction/statement timeouts before any load.

M1/M2 are strongly recommended alongside but not hard blockers for a read-heavy Slice B.

## Unresolved questions
- Confirm the installed `routing-controllers` version still catches a rejected async `use()` (else H1 becomes a hung request, not a 500). Could not inspect `node_modules` (blocked).
- Intended production DB role: dedicated NOSUPERUSER app role planned? If yes, M2 is a startup-assertion; if not, RLS is currently decorative in prod.
- Is read-your-writes a product requirement (e.g. UI re-fetch after create)? If so C1 severity is unambiguous; if the client always uses the POST response body, the window narrows but the failed-commit-after-201 case remains.

**Status:** DONE_WITH_CONCERNS
**Summary:** Isolation model is sound and fail-closed, but the flagship middleware commits after the response is flushed (C1, silent data loss / broken read-your-writes) and leaks a pooled connection on setup failure (H1); both plus pool sizing (H2) block Slice B write paths.
**Concerns/Blockers:** C1 commit-after-response requires rework (commit in the action pipeline); H1 release-on-setup-failure; H2 bound pool + tx timeouts.

# Code Review — Phase 00 Tenant Foundation

Branch `develop` (3 commits ahead of `main`). Read-only review. Multi-tenant booking SaaS.
Scope: tenant context/tx, base classes, tenant+membership modules, migration, OTel, RFC 7807.
Deferred-by-design items (RLS policies, JWT tenant claim, user.roles removal) NOT flagged.

Verified green pre-review: typecheck/build/lint/unit/integration/migration/smoke. Findings below are
correctness/design/security beyond test coverage.

---

## Critical
None.

## High

### H1 — `runInTenantContext` connection leak on transaction-start failure
`src/common/tenant/tenant-transaction.ts:19-21`
`createQueryRunner()` → `connect()` → `startTransaction()` all run BEFORE the `try` (line 22),
while `queryRunner.release()` is in the `finally`. If `connect()` or `startTransaction()` throws
(DB blip, pool timeout, connection reset), the acquired connection is never released → pool leak.
Under a transient DB outage every failed call permanently burns a pool slot → cascading
`Connection pool exhausted`. This is the primary request path for every tenant-scoped write in later
phases, so blast radius is the whole API.

Fix — pull acquisition inside the guarded block, or use the built-in helper which manages
connect/release/commit/rollback itself:
```ts
return dataSource.transaction(async (manager) => {
  await manager.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
  return runWithTenant({ tenantId, manager }, () => work(manager));
});
```
(`dataSource.transaction` releases the runner even if `startTransaction`/`set_config` throws.)

## Medium

### M1 — `scopedWhere` silently drops the tenant filter for array (OR) `where`
`src/common/base/tenant-repository.base.ts:35-37`
`{ ...where, tenantId }` assumes `where` is a single object. TypeORM allows `where` to be an
**array** (OR semantics). Spreading an array yields `{ 0:…, 1:…, tenantId }` — the OR branches are
lost AND each original branch never receives `tenantId`. Because Layer-2 RLS is deferred to phase-02,
Layer-1 is currently the ONLY isolation. A subclass author who casts an array `where` (the signature
only types a single object, so a cast is required — an easy footgun) gets a query that reads across
tenants. No live caller today (no entity extends `BaseTenantEntity` yet), so latent — but this base
class is the security backbone for every phase-02+ table.
Fix: detect arrays and map tenantId onto each branch, e.g.
```ts
protected scopedWhere(where: FindOptionsWhere<T> | FindOptionsWhere<T>[] = {}) {
  const tenantId = getTenantId();
  return Array.isArray(where)
    ? where.map((w) => ({ ...w, tenantId }))
    : { ...where, tenantId };
}
```
and widen the `findOne/findMany/findAndCount` `where` param type accordingly.

### M2 — Layer-1 does not scope loaded relations / joins
`src/common/base/tenant-repository.base.ts:39-58`
`scopedWhere` narrows only the root entity. Any `relations`/eager join pulls related rows with no
tenant predicate. Safe once RLS lands (phase-02) since each table's policy backstops it, but until
then a relation load is a cross-tenant read vector. Recommend: document that `relations` on
`BaseTenantRepository` reads are unsafe pre-RLS, and ensure every related table gets its RLS policy in
phase-02 before any relation traversal ships.

### M3 — `getTenantManager() ?? dataSource.manager` fallback becomes fail-closed footgun under RLS
`src/common/base/tenant-repository.base.ts:31`
When no tenant transaction is active, reads run on `dataSource.manager` (a pooled connection with no
`app.tenant_id`). Today Layer-1 still filters, so it "works". Once phase-02 enables RLS with
`current_setting('app.tenant_id', true)`, that pooled connection has the setting unset → policy sees
NULL → **zero rows returned silently** (or an error if cast to uuid without the `true` missing-ok
flag). Result: `BaseTenantRepository` used outside `runInTenantContext` will mysteriously return empty
sets. Recommend making the contract explicit now: throw if a tenant-scoped repo is used without an
active tenant manager (fail-fast) rather than silently falling back — surfaces the misuse at dev time
instead of as empty prod reads.

### M4 — 5xx responses leak internal `errors`/`details` in production
`src/common/middlewares/error-handler.middleware.ts:51-70`
For `status >= 500` in production only `detail` is scrubbed to `'Internal Server Error'`. The `errors`
field (sourced from `error.details` / `error.errors`, line 52/59) is still serialized into the
problem+json body. A 500 carrying `details` (e.g. a wrapped DB/driver error, or an
`AppException(500, …, details)`) exposes internals to external clients despite the detail scrub.
Fix: when `status >= 500 && env.isProduction`, also drop `errors` (set to `undefined`).

## Low

- **L1 — `error: any`** `error-handler.middleware.ts:45`. Untyped error param; pragmatic for a
  catch-all middleware but `code-standards.md` pushes typed identifiers. Consider `unknown` + the
  existing narrowing helpers, or a small `HttpErrorLike` interface.
- **L2 — `getTenantId()` throws 401 for missing context** `tenant-context.ts:26-32`. Absent tenant
  context is a programming/wiring error (authenticated user, no tenant resolved), not an auth failure.
  Returning 401 can mask a real bug as a client-side auth problem. Consider a distinct
  internal/500-class error for "context not set" vs. genuine unauthenticated.
- **L3 — Duplicate signal handlers** `tracing.ts:30-31` (OTel `process.once`) + `index.ts` terminus
  (`SIGINT`/`SIGTERM`) + `worker.ts:17-18` (`process.on`). Harmless (Node allows multiple listeners),
  but OTel shutdown races terminus/worker shutdown — span flush ordering not guaranteed on exit.
  Acceptable; verify final spans flush before `process.exit(0)` in `worker.ts` (exit may cut the
  async OTel flush short).
- **L4 — `traceId` returned to external clients** `problem-details.ts:50-59`. Documented/intentional
  for support correlation; it is only a correlation id (no secret), so acceptable — noting as minor
  info surface.
- **L5 — Nested `runInTenantContext` opens an independent tx/connection** `tenant-transaction.ts`.
  Not a real nested/savepoint tx — a second call while inside one acquires a separate connection and
  transaction. Risk of self-deadlock or read-your-writes surprises if ever nested. Add a guard
  (reuse existing manager if a tenant context is already active) or document "do not nest".
- **L6 — `persist()` update path** `tenant-repository.base.ts:60-63`. `save()` on an entity with an
  `id` issues `UPDATE … WHERE id = ?` scoped only by PK; `tenantId` is re-stamped (good) but there is
  no tenant predicate in the WHERE. Unreachable today (reads are scoped, so you can't load a foreign
  row to update) and RLS covers it in phase-02 — noted for completeness.

---

## Verified good (no action)
- **OTel first-import ordering is correct.** `tsconfig` is `module: commonjs`, no `"type":"module"`
  → CJS. `import '@config/tracing'` fully evaluates (incl. `sdk.start()`) before http/express/pg/
  ioredis are `require`d later. Auto-instrumentation patches them. The "no-op" risk does not apply.
- **`set_config($1,$2,true)` is injection-safe** (parameterized) and correct for RLS: the `true`
  = transaction-local (≡ `SET LOCAL`), scoped to the started transaction, never leaks across pooled
  connections. `startTransaction()` precedes it so the local scope exists.
- **`getTenantId` fails closed** (throws when unset) — correct default-deny.
- **Layer-1 never trusts caller tenant_id** — `scopedWhere`/`persist` source it from context only.
- **AsyncLocalStorage propagation** across the awaited `work` is correct (`storage.run` returns the
  promise; context survives awaits).
- **Migration**: `CREATE EXTENSION IF NOT EXISTS` idempotent; FK CASCADE correct; `down()` drops
  `memberships` before `tenants` (FK-safe order); leaving extensions installed is fine (shared/
  harmless, documented). Unique index `UQ_memberships_user_tenant` + `IDX_memberships_tenant` correct.
- **RFC 7807**: `about:blank` + status-phrase title per spec; prod 500 `detail` hidden; content-type
  `application/problem+json`; undefined members omitted by JSON serialization.
- **`Tenant`/`Membership` extend `BaseEntity` (not `BaseTenantEntity`)** — correct per design
  (tenant = boundary itself; membership queried pre-context by user_id).

---

## Metrics
- `any` usages introduced: 1 (`error-handler.middleware.ts:45`, catch-all — acceptable).
- Files reviewed: 15 source + migration + 1 test. New tests for tenant context/tx isolation: none in
  phase-00 (isolation test deferred to phase-02 by design).

## Unresolved questions
1. M3: intended contract when `BaseTenantRepository` is used outside `runInTenantContext` once RLS is
   live — fail-fast (throw) or documented empty-result? Needs a phase-01/02 decision.
2. L3: is OTel span flush-on-exit required in the worker, or is best-effort acceptable? `process.exit(0)`
   in `worker.ts:14` may truncate the async OTel shutdown.
3. M1/M2: will any phase-02 repo use array `where` or `relations`? If yes, M1/M2 become blocking before
   that code ships.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase-00 foundation is solid and injection-safe; one High connection-leak bug (H1) worth
fixing before merge, plus latent tenant-isolation gaps (M1–M3) that become load-bearing when RLS lands
in phase-02, and a prod 5xx info-leak (M4).
**Concerns:** H1 (connection leak) is the actionable pre-merge item. M1–M3 are latent but sit on the
security-critical base class — resolve or explicitly ticket before phase-02.

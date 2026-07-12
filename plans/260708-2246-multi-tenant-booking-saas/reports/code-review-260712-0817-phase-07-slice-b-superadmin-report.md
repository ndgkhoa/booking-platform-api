# Code Review — Phase 07 Slice B: Super-Admin Tenant Console

Date: 2026-07-12 | Reviewer: code-reviewer | HEAD: 0f9be4b (uncommitted working tree)
Scope: privileged cross-tenant path — security correctness, auditability, multi-tenant isolation.

## Scope
Files reviewed:
- src/modules/admin/{admin.controller,admin.service,admin-audit-log.entity,admin-audit-log.repository}.ts + dto/suspend-tenant.dto.ts
- src/common/middlewares/tenant-context.middleware.ts (suspended gate)
- src/common/interceptors/tenant-transaction.interceptor.ts, src/common/tenant/tenant-transaction.ts (context)
- src/modules/tenant/{tenant.repository,tenant.service}.ts (listAll/updateStatus)
- src/database/migrations/1780299400000-AdminAuditLogs.ts
- src/server.ts authorizationChecker/currentUserChecker
- test/support/integration-context.ts, test/integration/admin.e2e.spec.ts

Overall: design is solid; the atomic status+audit unit-of-work, non-forgeable actor id, and gate placement are sound. One genuine isolation-risk bug on an error branch of the suspended gate. Rest are Low/informational.

---

## HIGH

### H1 — Suspended-gate catch path releases connection WITHOUT rolling back the open transaction (cross-tenant isolation risk)
File: src/common/middlewares/tenant-context.middleware.ts:74-78

```
} catch (error) {
  await queryRunner.release();   // <-- transaction still ACTIVE here
  next(error as Error);
  return;
}
```

The try block runs `startTransaction()` (L59), then `set_config('app.tenant_id', ...)` (L60) and the gate `SELECT` (L64). If either query throws (statement/lock timeout, connection blip, transient DB error), the transaction is still active. `queryRunner.release()` does NOT issue a ROLLBACK — TypeORM returns the underlying `pg` client to the pool as-is. The connection goes back "idle in transaction" with tenant A's `app.tenant_id` still set on it.

Failure scenario: transient error on the gate SELECT for tenant A → connection returned to pool mid-transaction → next request borrowing that pooled connection either (a) executes under tenant A's leftover RLS scope = cross-tenant read/write, or (b) hits `current transaction is aborted` / `idle_in_transaction_session_timeout` errors cascading as 500s. This is precisely a production-only fault masked in CI (needs a mid-query DB failure to trigger).

Note the inconsistency: the `blocked` branch (L80-88) correctly does `rollbackTransaction()` then `release()`; only the error branch skips the rollback.

Fix:
```
} catch (error) {
  try {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
  } finally {
    await queryRunner.release();
  }
  next(error as Error);
  return;
}
```
(`isTransactionActive` guards the case where `connect()`/`startTransaction()` themselves threw and no tx exists.)

---

## MEDIUM

### M1 — getTenantDetail audits AFTER the read; a failed privileged access leaves no trace
File: src/modules/admin/admin.service.ts:39-49

Order is: getById → runInTenantContext(currentSubscription) → `audit.record('tenant.view')`. If `currentSubscription()` (or getById) throws, the audit row is never written — a super-admin cross-tenant access attempt that partially executed (RLS scope opened, subscription table queried under tenant scope) produces no audit entry. For a read this is lower-impact than a mutation, but it is an auditability gap on the privileged path the log exists to cover. Unlike `changeStatus` (atomic), the view audit is best-effort and also not in the same tx/connection as the read.

Recommend: record the audit intent before/around the read (or in a finally that also records failures with an outcome field) so privileged access attempts are always traceable. At minimum, document that `tenant.view` is success-only.

### M2 — Malformed non-UUID `:id` yields 500 instead of 400/404
File: src/modules/admin/admin.controller.ts:33,40,47 → admin.service.ts getById/changeStatus/getTenantDetail

`@Param('id') id: string` is passed straight into `findOne({ where: { id } })` / `findById`. A malformed id (`/admin/tenants/not-a-uuid`) hits Postgres `uuid` type → error 22P02 → `error.httpCode` undefined → ErrorHandler maps to 500. Semantically should be 400/404. No data leak (prod masks 5xx detail), and this matches the existing codebase convention (customer/service controllers do the same), so severity is bounded — but on a privileged route a malformed id logging a 500 is poor. Consider a UUID validation pipe/decorator (codebase-wide improvement, not slice-specific).

---

## LOW / INFORMATIONAL

### L1 — Dead code: TenantRepository.updateStatus is added but never called
File: src/modules/tenant/tenant.repository.ts:23-25

`updateStatus` was added in this diff but `admin.service.changeStatus` performs the status flip via `manager.getRepository(Tenant).save()` (deliberately, for the atomic unit-of-work). No caller references `tenant.repository.updateStatus`. Remove per YAGNI, or wire it if intended.

### L2 — super_admin WITH a tenantId claim could be locked out of /admin by the gate (edge)
File: src/common/middlewares/tenant-context.middleware.ts:50-88

Design guarantees super-admin tokens carry no tenantId, so the gate is skipped for them (L50 short-circuit). But the gate runs purely on token shape, before authorizationChecker. If a super_admin ever obtained a tenant-scoped token for a suspended tenant, the gate 403s them before they reach any /admin route. Defense-in-depth: either skip the gate when the token role is super_admin, or explicitly assert/enforce that super_admin tokens never carry tenantId at issuance. Not exploitable given current token issuance — note only.

### L3 — Immutability RULEs `DO INSTEAD NOTHING` silently swallow UPDATE/DELETE
File: src/database/migrations/1780299400000-AdminAuditLogs.ts:25-30

Intended and sound for append-only. Two operational notes: (a) any accidental app-side UPDATE/DELETE succeeds with 0 rows and NO error — masks bugs (a trigger RAISE EXCEPTION would fail loud instead, at the cost of ergonomics); (b) legitimate retention/GDPR erasure requires dropping the rule first. Acceptable given intent; document the erasure procedure. Test harness uses synchronize so RULEs are absent in tests — confirmed expected, but the immutability guarantee is therefore untested (no test asserts an UPDATE/DELETE is rejected in a migrated DB).

### L4 — No FK on actor_user_id / target_tenant_id, and `action` column unconstrained
File: admin-audit-log.entity.ts:20-27, migration L12-13. FK omission is intended (immutable log must survive user/tenant deletion) — sound. `action` is `varchar` with no CHECK/length; the TS union (`AdminAction`) is not DB-enforced. Since `action` is server-set (never client input) this is low risk; a CHECK constraint would harden it cheaply.

---

## Verified sound (design-intent items confirmed)
- AuthZ coverage: class-level `@Authorized(SUPER_ADMIN_ONLY)` applies to every action in AdminController; no method omits the guard. authorizationChecker (server.ts:40-59) sets `request.user` then short-circuits `true` only for `user.isSuperAdmin`; a non-super-admin owner is correctly rejected (role `owner` ∉ `[super_admin]`) — asserted by e2e test "forbids a non-super-admin (403)". No bad interaction with class+method guards (only class-level guards used).
- Mutation atomicity: `changeStatus` (admin.service.ts:66-92) flips `tenant.status` and inserts the audit row in ONE `dataSource.transaction` — a privileged mutation cannot land without its audit entry (and INSERT is not blocked by the immutability RULEs). Verified sound.
- Audit trust boundary: `actorUserId` flows from `@CurrentUser` (passport JWT → server.ts:47,61), not client input; `action` is hardcoded server-side; only `targetTenantId` is client-controlled (the legitimate target). Not forgeable.
- runInTenantContext (tenant-transaction.ts) uses `dataSource.transaction`, which owns connect/commit/rollback/release — so getTenantDetail does NOT leak a connection even if `currentSubscription()` throws (contrast with H1's manual query runner).
- RLS: `listTenants`/`getById`/`changeStatus` operate on `tenants` (no ROW LEVEL SECURITY in TenantFoundation migration — confirmed) and `admin_audit_logs` (not RLS-scoped) without a tenant scope; no cross-tenant leak and no silent RLS block. Tenant-scoped reads (subscription) go only through the explicit audited `set_config` path — no blanket BYPASSRLS anywhere.
- Suspended gate: reads `tenants` (the isolation boundary, correctly outside RLS scope) via one indexed lookup; `blocked` branch rolls back + releases correctly (L80-88); happy-path rollback safety net is guarded by `req.tenantTxSettled` and cooperates with TenantTransactionInterceptor's commit — no double-release, next() called exactly once on every branch.
- Migration reversibility/idempotency: up creates table+index+2 rules; down drops rules (IF EXISTS) then table — clean reverse. No FK dependents to sequence.
- Data exposure: Tenant and AdminAuditLog payloads carry no secrets/PII beyond ids/slug/status; ErrorHandler masks 5xx detail + stack in production.

---

## Unresolved questions
1. M1: is "success-only" auditing of `tenant.view` an accepted decision, or should failed/attempted privileged access also be logged (with an outcome field)? Affects whether M1 is a fix or a documented choice.
2. L3: what is the operational erasure/retention path for `admin_audit_logs` given the DELETE rule (compliance)? Is loud-fail (trigger RAISE) preferred over silent no-op for tamper attempts?
3. Should super_admin tokens be asserted tenantId-free at issuance (L2), or is skip-gate-for-super_admin-role the preferred hardening?

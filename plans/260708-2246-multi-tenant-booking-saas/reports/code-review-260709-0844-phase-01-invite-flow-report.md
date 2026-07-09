# Code Review — Phase-01 Invite Flow

Scope: `git diff d284994..cd445eb` on `develop`. Read-only.
Files: invite {entity,repository,service,controller,dto}, email queue/worker, migration, membership.service, redis, env, test harness.
CI already green (typecheck/lint/build/unit 5, integration 24, migration up/down). Findings below are correctness/security/design beyond tests.

## Verdict
Slice is well-built: token-hash-only storage, atomic single-use claim, tenant stamped from context (no cross-tenant param), no token logging. Two items should be resolved before phase-02 (RLS). No Critical defects.

---

## Critical
None.

---

## High

### H1 — accept(): mark + membership create are not atomic; transient failure permanently burns the invite
`src/modules/invite/invite.service.ts:63-73`
`markAcceptedIfPending` commits `accepted_at` in its own statement, then `memberships.create` runs separately. If the create fails for any **transient/non-23505** reason (DB blip, deadlock, connection drop), the invite is already consumed. Retry → `markAcceptedIfPending` returns false → `409 Invite already used`. Recipient is permanently locked out with no membership and no recovery path (no resend/revoke).
- The `23505` (already-member) branch is benign — user already has the membership, so a consumed invite is acceptable there.
- Tenant-deleted-between-invite-and-accept is safe: FK `ON DELETE CASCADE` removes the invite, so `findByHash` returns null → `401 Invalid`. (Verified `1780298500000-Invites.ts:20-21`.)

Fix: wrap the claim + membership insert in one transaction so the `accepted_at` update rolls back when the insert throws anything other than 23505. Sketch:
```ts
await runInTransaction(async () => {
  if (!(await this.invites.markAcceptedIfPending(invite.id, new Date()))) throw new Conflict('used');
  try { return await this.memberships.create(...); }
  catch (e) { if (code(e)==='23505') { /* keep consumed: already a member */ return existing/throw 409 }
              throw e; /* rolls back the claim */ }
});
```
Simpler alternative: create the membership FIRST (idempotent on 23505), then `markAcceptedIfPending`; on any failure the invite stays pending and is retryable. Either removes the lock-out window.

### H2 — Phase-02 RLS blocker: InviteRepository bypasses the tenant-scoped manager
`src/modules/invite/invite.repository.ts:9-19`
Repo binds to the plain `dataSource.getRepository`, not `getTenantManager()`. Works today (no RLS) but breaks once phase-02 lands `SET LOCAL app.tenant_id` + RLS:
- **create (INSERT)** never runs inside `runInTenantContext` (the middleware sets context *without* a manager/transaction — `tenant-context.middleware.ts:36`). With an RLS `WITH CHECK (tenant_id = current_setting('app.tenant_id'))` policy, the insert will be **rejected** because the GUC is unset.
- **findByHash (cross-tenant SELECT)** is *intentionally* cross-tenant. Under a fail-closed RLS SELECT policy it will return **zero rows** when `app.tenant_id` is unset/mismatched, breaking accept entirely.

Not a bug now, but a hard design constraint. Fix in phase-02: run `create` inside `runInTenantContext`, and give accept-by-hash an explicit RLS carve-out (SECURITY DEFINER function, a `USING (true)` policy for the token lookup, or a dedicated unscoped role). Flag so RLS rollout doesn't silently break invites. Leave a comment at `invite.repository.ts:17` noting the accept path must remain RLS-exempt.

---

## Medium

### M1 — Invite email binding rests on an unverified email
`src/modules/invite/invite.service.ts:59-61`; no email-verification anywhere (`user.entity.ts` has no `verified` flag; auth module has none).
The email match is presented as the identity binding, but users self-assert their email at registration with no verification. Anyone who obtains the (secret) token AND registers an account with the matching address can redeem. Token secrecy is the real gate (256-bit, fine), so this is defense-in-depth, not a break — but the binding is weaker than the code comments imply. Note for the auth roadmap; consider requiring a verified email before `accept` once verification exists.

### M2 — No duplicate/already-member guard at create time
`invite.service.ts:27-36`; no unique index on pending `(tenant_id, email)`.
Owner can mint unlimited concurrent invites for the same email (each a new row/token) and can invite someone who is already a member. The already-member case only surfaces as `409` at accept. Acceptable YAGNI for the slice, but consider a partial unique index `UNIQUE(tenant_id, lower(email)) WHERE accepted_at IS NULL AND deleted_at IS NULL` to keep the table sane, and/or a pre-check that the email isn't already a member. Combined with M4 (no cleanup) the table grows unbounded.

### M3 — 401 for invalid/expired token on an authenticated route
`invite.service.ts:54,57`
`accept` runs behind `@Authorized()` (user is authenticated), but invalid/expired invite throws `UnauthorizedException` (401). 401 signals "your session is bad" and can trigger clients to force re-login/token-refresh. These are resource states, not auth failures — use `BadRequest`/`NotFound` (invalid) and `BadRequest`/`Gone` (expired). Keep the email-mismatch as `403` (correct).

---

## Low

### L1 — AcceptInviteDto MinLength(32) is looser than the real token
`src/modules/invite/dto/accept-invite.dto.ts:5` — token is 64 hex chars (`randomBytes(32).toString('hex')`, service:29). Not a security issue (wrong hash → null lookup), but tighten to `@Length(64,64)` / `@Matches(/^[0-9a-f]{64}$/)` to reject garbage cheaply.

### L2 — Expired/accepted invites never cleaned
No TTL sweep/cron. Table grows forever. A BullMQ repeatable prune job (or `deleted_at` soft-delete on expiry) is cheap; defer but track.

### L3 — INVITE_TTL_DAYS has no lower bound
`src/config/env.ts:21` `num({ default: 7 })` — a misconfigured `0`/negative makes every invite expire instantly. Add `envalid` min validation.

### L4 — Extra tenant fetch purely for email
`invite.service.ts:38` fetches the full tenant on every create just for `tenant.name`. Minor; fine given low volume, but it runs even when Redis is down (email will be dropped anyway). Could fetch name lazily inside the worker or select only `name`.

---

## Positive / verified clean
- **No cross-tenant privilege escalation** (concern 1): `create` derives `tenantId` from `getTenantId()` (token claims), not from any DTO field; `@Authorized(['owner'])` gates creation; staff cannot invite. Owner minting an `owner` invite is legitimate. Verified `invite.controller.ts:16`, `service.ts:28`, `server.ts:39-57`.
- **Single-use claim** is genuinely atomic — conditional `UPDATE ... WHERE accepted_at IS NULL` (`repository.ts:23-24`); double-redeem race returns 409.
- **No token leakage to logs** — worker logs email/tenant/role only, never the token or `acceptUrl` (`email.worker.ts:11-15`). Plaintext token returned only to the creating owner and in the email link — acceptable.
- **sha256 unsalted** is correct for a 256-bit random token (no dictionary/rainbow risk).
- **Best-effort email** (`void enqueue().catch()`, service:40-45) does not block or fail the request; token is in the create response, so a dropped email is recoverable. `lazyConnect` + `.catch` means a down Redis logs a warn and moves on — no hang/leak.

---

## Blockers before phase-02
1. **H2** — decide the RLS strategy for InviteRepository (scoped INSERT via `runInTenantContext`, RLS-exempt accept-by-hash) *before* enabling RLS, or invite create/accept will break.
2. **H1** — make claim+membership atomic; otherwise the lock-out bug ships into a flow with no revoke/resend to recover from.

## Unresolved questions
- Is `forceExit: true` (jest.config.js:32) masking only the BullMQ/ioredis handle, or app-code handles too? Run once with `--detectOpenHandles` and no forceExit to confirm the only open handle is the Redis connection, then keep forceExit.
- Phase-02 RLS: will accept-by-hash use a SECURITY DEFINER function or a permissive token-lookup policy? Decision drives H2's fix shape.
- Product: is silently dropping the invite email (Redis down) acceptable given no resend endpoint exists? If owners rely on the emailed link rather than copying the API response token, a dropped email strands the invitee.

**Status:** DONE
**Summary:** Invite slice is solid on tenant-scoping, single-use claim, and token hygiene; 2 High items (non-atomic accept lock-out, RLS-bypass repo) should land before phase-02, plus unverified-email binding and lifecycle gaps at Medium/Low.
**Concerns/Blockers:** H1 and H2 are phase-02 blockers per above.

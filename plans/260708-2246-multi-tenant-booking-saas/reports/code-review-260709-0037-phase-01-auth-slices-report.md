# Phase-01 Auth Slices — Code Review

Range: `1d9ff47..develop` (8c0ab71 auth core, 0c84a38 harness, 3e01498 refresh tokens)
Scope: RBAC, refresh-token rotation, token/session, onboarding tx, migration, DTO/validation.
Green already: typecheck/lint/build, unit 5/5, integration 17/17, migrations up/down. Findings below are correctness/security/design beyond tests.

## Overall
Solid, well-commented slice. Fail-closed authz is correct, super_admin is un-spoofable (read from DB, not token), passwordHash exclusion verified, secrets not logged (morgan `combined` logs no body), onboarding is atomic. The material risks are all in **session lifecycle**: revoked privileges persist far longer than the 15m access TTL implies, logout is incomplete across tenant switches, and refresh rotation has a TOCTOU that defeats reuse detection. Two of these should block before the invite slice, because invites introduce membership add/remove — the exact state changes these bugs fail to honor.

---

## Critical

### C1. Refresh rotation re-issues stale tenant/role — revoked access persists up to REFRESH_TOKEN_TTL_DAYS (default 30d)
`src/modules/auth/refresh-token.service.ts:40-61`, consumed at `src/modules/auth/auth.service.ts:61-69`.
`rotate()` re-mints the access token from the **snapshot** `record.tenantId` / `record.role` and never re-checks the live membership. Because rotation preserves the same family and copies the old scope forward (`issue(record.userId, scope, record.familyId)`), a user whose membership is deleted or whose role is downgraded (owner→staff) keeps minting access tokens with the **old** role for the full refresh-token lifetime (30 days), not the 15m access-token window. In a multi-tenant SaaS, "removed staff still has owner access for 30 days" is a trust-boundary failure and directly contradicts what the invite slice will need (remove-member must take effect).
Fix: on `rotate()`, re-resolve role against current membership and drop stale sessions:
```ts
const role = await this.memberships.resolveRole(record.userId, record.tenantId); // inject MembershipService
if (record.tenantId && !role) {            // membership gone → kill the session
  await this.tokens.revokeFamily(record.familyId, new Date());
  throw new UnauthorizedException('Membership no longer valid');
}
const scope = { tenantId: record.tenantId ?? undefined, role: role ?? undefined };
```
(super_admin path still bypasses at the gate via DB `isSuperAdmin`, so no special-case needed there.) Alternatively shorten refresh TTL drastically, but re-resolving is the correct fix. **Blocker.**

---

## High

### H1. `logout` revokes only ONE family; switch-tenant/onboard mint new families without revoking old ones → incomplete logout
`src/modules/auth/auth.service.ts:52-58,75-79` + `refresh-token.service.ts:26-37,64-69`.
Every `login`, `switchTenant`, and `issueSession` mints a **new** family (`familyId ?? randomUUID()`) and never revokes the previous one. So a user who logs in then switches tenants twice holds ~3 live refresh families, each valid 30 days. `logout(refreshToken)` → `revoke` → `revokeFamily(record.familyId)` burns only the family of the presented token; the others keep rotating. Result: "log me out" does not end the user's other sessions, and there is no way to enumerate/kill them.
Fix options: (a) on logout revoke **all** of the user's active families (`revokeAllForUser(userId)`); and/or (b) have `switchTenant` **rotate** the caller's current refresh token instead of minting a fresh family. At minimum, revoke-by-user on logout. **Recommend block before invite slice** (invite/session revocation semantics build on this).

### H2. Refresh rotation TOCTOU — concurrent use of the same token double-issues and silently defeats reuse detection
`src/modules/auth/refresh-token.service.ts:41-59`.
`rotate()` is check-then-act: `findByHash` → `if (record.usedAt)` → `markUsed`. Two concurrent requests with the same plaintext both read `usedAt=null`, both pass, both `markUsed`, both `issue` into the same family. No DB constraint prevents two un-used tokens per family, so both succeed. A stolen token racing a legitimate refresh therefore yields two valid successors and **never triggers `revokeFamily`** — the theft-detection guarantee is void under concurrency.
Fix: make the used-marking an atomic conditional claim and treat "0 rows updated" as reuse:
```ts
// repo: UPDATE refresh_tokens SET used_at=$2 WHERE id=$1 AND used_at IS NULL  → return affected
const claimed = await this.tokens.claimForRotation(record.id, new Date());
if (!claimed) { await this.tokens.revokeFamily(record.familyId, new Date());
  throw new UnauthorizedException('Refresh token reuse detected'); }
```
Wrap claim+issue so the winner alone proceeds. Ranked High (weakens the primary security feature of this slice); the current e2e only tests sequential reuse so it passes.

---

## Medium

### M1. Concurrent same-slug onboarding returns 500, not 409
`src/modules/tenant/tenant.service.ts:23-34`; DB constraint `UQ_tenants_slug` (`1780298200000-TenantFoundation.ts:25`); error handler has no 23505 mapping (`error-handler.middleware.ts:8-16,51`).
The app-level `findOne({slug})` check is not race-safe. Two concurrent onboards with the same slug both pass the check; the losing INSERT hits the unique index → Postgres 23505 → propagates as 500 (`Internal Server Error` in prod). The 409 test passes only because it runs sequentially on one connection.
Fix: catch the unique violation and translate — either `try { save } catch (e) { if (e.code === '23505') throw new ConflictException('Tenant slug already in use') }`, or add a generic 23505→409 mapping in `ErrorHandler`. The app pre-check can stay as a fast path.

### M2. `login` "primary membership" is nondeterministic
`src/modules/auth/auth.service.ts:47` + `membership.repository.ts:13-15`.
`const [primary] = await listForUser(...)` takes the first row of `repo.find({ where: { userId } })` with **no ORDER BY**. For a user in multiple tenants, the tenant they log into is whatever order Postgres returns — can change between logins. Fix: define a deterministic primary (e.g. `order: { createdAt: 'ASC' }`, or a `primary`/`lastActiveTenantId` flag). Same nondeterminism will bite the invite slice when users routinely belong to 2+ tenants.

### M3. Onboarding issues access token but no refresh token → refresh silently drops tenant scope
`src/modules/tenant/tenant.controller.ts:24-28` (returns `{ tenant, token }` only), vs register/login/switch which return access+refresh (`auth.service.ts`).
After onboarding, the client still holds the identity-only refresh token minted at register. When the 15m access token expires and the client refreshes, it gets a **no-tenant** access token and loses owner scope until a full re-login. Inconsistent with every other auth response. Fix: have `onboard` go through `issueSession` (or return a fresh owner-scoped refresh token) so the pair stays coherent. (Also note: after C1's fix, this becomes even more important since refresh will re-resolve scope from the token's snapshot.)

### M4. Access/tenant staleness within the 15m access token is unmitigated (accepted-but-undocument)
`src/server.ts:39-58` + `tenant-context.middleware.ts:34-39`.
The gate trusts `tokenClaims.role`/`tenantId` from the signed access token; no live membership re-check. Independent of C1, a role change is invisible for up to the access-token TTL (15m). This is the normal stateless-JWT trade-off and acceptable, but it should be an explicit, documented decision (and 15m is the right ceiling). No code change required; flag so it is a conscious choice before invites ship.

---

## Low

- **L1. `RefreshTokenDto` MinLength(32) is looser than the real token (64 hex chars).** `dto/refresh-token.dto.ts:5`. Harmless (short tokens just miss the hash lookup → 401) but `MinLength(64)` matches `randomBytes(32).toString('hex')`.
- **L2. `CreateTenantDto.timezone` not validated as IANA.** `dto/create-tenant.dto.ts:14-16` — any string is stored; a bad tz surfaces later when rendering tenant-local times. Consider `@IsIn(Intl.supportedValuesOf('timeZone'))` or validate on use.
- **L3. `rotate()` markUsed→issue is non-transactional.** `refresh-token.service.ts:54-59`. If `issue` throws after `markUsed`, the old token is burned with no successor → user must re-login. Availability only, not security; wrapping in a tx (alongside H2's atomic claim) closes it.
- **L4. `down` migration is lossy (expected).** `1780298300000-UserRolesToSuperAdmin.ts:18-24` restores `roles='admin,user'` for super-admins and `''` for everyone — original per-user role strings are gone. Inherent once the column is dropped; note in the migration/PR so a down isn't mistaken for data-preserving.
- **L5. No cap on tenants per user.** `tenant.service.ts:22` / `tenant.controller.ts:21-24` — any authenticated user can create unlimited tenants. Rate-limited globally (100/15m) but not per-user; likely a business decision for a later phase.

---

## Verified NON-issues (checked, no action)
- **super_admin spoofing:** `isSuperAdmin` is read from DB by passport (`jwt.strategy.ts:17`), never from the token — cannot be forged. `server.ts:47`.
- **Migration backfill on empty roles:** `string_to_array('', ',')` = `{''}` (one empty element), so `'admin' = ANY(...)` is false — no false-positive super-admins. `1780298300000...:12-14`.
- **Token entropy / storage:** 256-bit random (`randomBytes(32)`), stored as unsalted SHA-256 — adequate for high-entropy tokens (no salt needed; no rainbow/dictionary risk). Lookup is by indexed hash equality, not plaintext compare — not timing-exploitable. `refresh-token.service.ts:27,31` + `hash.ts`.
- **Plaintext token logging:** morgan `combined` logs no request body; refresh token travels in the body. No leak. `http-logger.middleware.ts`.
- **passwordHash exposure:** `@Exclude` + `classTransformer: true` strips it; covered by e2e (`auth.e2e.spec.ts:33,50`).
- **Double JWT decode (middleware + passport):** same secret, same token, both enforce `exp` — no accept/reject divergence.
- **Expired-token path not revoking family:** intended and safe — `usedAt` check precedes `expiresAt` (`service.ts:45,50`), so a used+expired token still triggers reuse revocation; a merely-expired token dies naturally.
- **Fail-closed on missing tenant context:** roles-required + no `tokenClaims.role` → `resolve(false)`. `server.ts:55-56`. Correct.
- **Onboarding tx / tenant context:** Tenant & Membership extend `BaseEntity` (not tenant-scoped), so `dataSource.transaction` with direct `manager.getRepository` is correct — no tenant context required. `tenant.service.ts:23-34`.

---

## Blockers before invite slice
- **C1** (stale role/tenant on refresh → 30-day privilege persistence) — invites make member removal a routine op; must take effect.
- **H1** (incomplete logout across families) — session revocation semantics underpin invite/remove flows.
- **H2** (rotation TOCTOU) — strongly recommended; theft detection is a stated goal of this slice.
- M1–M3 are fix-soon but not strict blockers.

## Unresolved questions
1. Intended lifecycle on **switch-tenant**: mint a new family (current) or rotate the caller's existing token? Answer drives H1's fix shape.
2. Is 15m access / 30d refresh the deliberate staleness budget (M4)? If member-removal must be near-instant, refresh needs live re-resolution (C1) regardless.
3. Should **logout** be single-session (this family) or all-sessions (whole user)? Affects H1 fix scope.
4. Is unlimited tenant creation per user (L5) acceptable for phase-01, or deferred with a known TODO?

**Status:** DONE_WITH_CONCERNS
**Summary:** Auth slices are structurally sound (fail-closed authz, un-spoofable super_admin, atomic onboarding), but session lifecycle has one critical (C1: refresh re-issues stale role → up to 30d privilege persistence) and two high issues (H1 incomplete logout, H2 rotation TOCTOU defeating reuse detection) that should block before the invite slice.
**Concerns/Blockers:** C1, H1, H2 as above; M1 (concurrent slug → 500) and M2/M3 (nondeterministic primary tenant, onboard omits refresh token) fix-soon.

# Code Review — Phase-07 Slice A (Billing: payment-provider Strategy + subscriptions + webhooks + entitlement)

Commit `6ecee9d` on `develop`. Read-only review. Diff vs `HEAD~1`. Files reviewed: `src/modules/billing/**`, `src/server.ts`, `src/config/{env,data-source}.ts`, `staff.service.ts`, migration `1780299300000-Billing.ts`, e2e spec.

Green claim confirmed by design intent; **all e2e coverage runs under `synchronize` with no RLS**, so the two most severe prod defects below are structurally invisible to the current test suite.

---

## CRITICAL

### C1 — Webhook apply path does not work in production under RLS FORCE (silent no-op, event lost)
`subscription.repository.ts:34-36,43-45` + `billing.service.ts:65-72` + `billing-webhook.controller.ts:44-46`

The inbound webhook runs unauthenticated → **no tenant transaction, `app.tenant_id` is never set**. Both `findByReference` (SELECT) and `updateStatus` (UPDATE) execute on the raw `dataSource` pool with no `SET LOCAL app.tenant_id`. `subscriptions` is `ENABLE + FORCE ROW LEVEL SECURITY` with policy `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)`.

In prod with a normal (non-superuser, non-`BYPASSRLS`) `DB_USER`:
- `current_setting('app.tenant_id', true)` → `NULL` → `tenant_id = NULL` → NULL → row excluded.
- `findByReference` returns `null` → `applyPaymentEvent` returns `false` → subscription **never activates**.
- Even if the read somehow resolved, `updateStatus` UPDATE matches **0 rows** (WITH CHECK / USING both fail) → silent no-op.

This works in dev/test only because the connection is superuser (and tests use `synchronize` with no RLS at all). The repo comment at `subscription.repository.ts:28-33` claims "the subsequent write is applied under the resolved tenant's context" — **the code does not do this**; `updateStatus:44` uses the raw manager with no `set_config`. The comment is misleading.

Combined with C2, the event is not merely un-applied — it is **permanently lost** (receipt already claimed).

**Fix (blocker before prod / Slice B):**
1. Give the webhook path a DB role with `BYPASSRLS` (dedicated system DataSource/role), OR
2. Resolve the tenant via a bypass read, then perform the write inside a short tx that first sets the resolved tenant:
```ts
await qr.startTransaction();
await qr.query('SELECT set_config($1,$2,true)', ['app.tenant_id', sub.tenantId]);
await qr.manager.getRepository(Subscription).update(sub.id, { status });
await qr.commitTransaction();
```
There is currently a single `AppDataSource` with one `DB_USER` and no system/bypass role — infra work is required. Fix the misleading comment either way.

### C2 — Receipt claimed and committed BEFORE apply → non-atomic → events silently dropped on any apply failure
`billing-webhook.controller.ts:44-46`, `webhook-receipt.repository.ts:14-21`

`receipts.claim()` runs as a standalone autocommitted `INSERT ... ON CONFLICT DO NOTHING RETURNING` on the pooled dataSource — committed immediately, **not** in a transaction with the subsequent `applyPaymentEvent`. If `applyPaymentEvent` then:
- throws `assertCanTransition` 422 (out-of-order event, e.g. a `payment.failed` while still `trialing` — `TRANSITIONS[trialing]` = `[active, canceled]`, past_due not allowed), or
- returns `false` (subscription not found — which is the **normal** prod outcome per C1),

…the receipt is already persisted. The provider retries the **same event id** → `claim()` returns `false` → apply is skipped → `200 {received:true}`. The event is **permanently lost**; the subscription is stuck. Controller also ignores the `boolean` from `applyPaymentEvent`, so a `false` (not-found) is indistinguishable from success.

**Fix:** make claim + apply atomic in one transaction; roll back the claim if apply throws or returns false, so the provider's retry re-processes:
```ts
// one queryRunner/tx: INSERT receipt RETURNING → if row: applyPaymentEvent → commit; on error/false: rollback
```
Do not treat "not found" as success — either 404/retryable, or ensure C1 makes the lookup reliable first.

---

## HIGH

### H1 — Stripe webhook: no timestamp tolerance → replay of a captured valid event is accepted
`providers/stripe.provider.ts:29-39`

HMAC is computed over `${timestamp}.${rawBody}` but `timestamp` freshness is never checked. Anyone who captures one valid `t=,v1=,body` triple can replay it indefinitely and it verifies. The only backstop is `webhook_receipts` dedup by event id — which fails open if receipts are ever pruned/retained-with-TTL, and does nothing to bound the replay window itself. Stripe's own libraries enforce a 300s tolerance for exactly this reason.

**Fix:** reject when stale:
```ts
const skew = Math.abs(Date.now() - Number(timestamp) * 1000);
if (!Number.isFinite(skew) || skew > 5 * 60 * 1000) return false;
```

### H2 — Single shared webhook secret + default value, no prod guard
`config/env.ts:24` (`BILLING_WEBHOOK_SECRET: str({ default: 'dev-billing-secret' })`), used for **both** providers and all tenants (`billing-webhook.controller.ts:34`).

- Unlike `JWT_SECRET` (`env.ts:20`, required, no default), the webhook secret **defaults to `'dev-billing-secret'`**. If prod deploy forgets to set it, **all webhooks are forgeable** — anyone can POST a signed `payment.succeeded` and activate/downgrade any subscription. The e2e even hardcodes this default (`billing.e2e.spec.ts:7`).
- One shared secret cannot model reality: Stripe issues its own `whsec_…` endpoint secret (you don't choose it) and SePay has its own. They cannot both equal one env value in a real integration, and independent rotation is impossible.

**Fix:** per-provider secret (`STRIPE_WEBHOOK_SECRET`, `SEPAY_WEBHOOK_SECRET`), required (no default) — envalid `str()` with no default, or a prod assertion that rejects the dev value. Pass the provider-specific secret in the controller.

### H3 — `subscribe()` does not catch the unique-index race → 500 instead of 409
`billing.service.ts:36-48`

The `findActive` check (`:36`) is TOCTOU; the partial-unique `UQ_subscriptions_active` correctly backstops concurrent double-subscribe, but the resulting `23505` from `subscriptions.create` (`:43`) is **not caught** → propagates as 500. `StaffService.create` (`staff.service.ts:30-34`) handles this exact case as 409; billing is inconsistent.

**Fix:** wrap `create` in try/catch, map `error.code === '23505'` → `ConflictException('Tenant already has a subscription')`.

### H4 — `past_due` grants UNLIMITED entitlement (privilege escalation on payment failure)
`entitlement.service.ts:28-35`, `subscription-status.ts:11-13`

`ENTITLED_STATUSES = [trialing, active]`. When a subscription is `past_due` (payment failed), `staffLimit()` hits the `!ENTITLED_STATUSES.includes(status)` branch and returns **`-1` (unmetered)**. So a paying customer whose card fails goes from their plan cap to **unlimited staff** — the opposite of the intended restriction. Same for a lapsed sub.

**Fix:** a non-entitled *existing* subscription must fall back to the most-restrictive cap (free-tier `maxStaff`, or 0/blocked), never `-1`. Only a tenant with genuinely no subscription should be treated as unmetered (and see M1 — that itself is questionable).

---

## MEDIUM

### M1 — Free-plan limits are unenforceable: no free subscription auto-provisioned
No `subscribe`/subscription creation exists in tenant onboarding (grep of `src/modules/tenant`, `src/modules/auth` — none). Per `entitlement.service.ts:29-31` a tenant with no active subscription is treated as **unmetered**. Therefore the seeded `free` plan (`maxStaff: 2`) is enforced for **nobody** on the default path — every tenant that never subscribes gets unlimited staff for free. The `free` cap only applies if a tenant explicitly subscribes to it and it becomes active/trialing. Confirm product intent; if free is meant to be the enforced floor, auto-create a trialing/active free subscription on tenant creation.

### M2 — `maxBookingsPerMonth` is a dead limit
`plan.entity.ts:26-27` + seeded (`free=100`) but referenced **nowhere** outside entity/migration (grep confirmed). It is defined and stored but never enforced — misleading. Either wire it into the booking-create path or drop it from this slice until enforced.

### M3 — Entitlement TOCTOU over-provision
`staff.service.ts:27` calls `assertWithinStaffLimit(await staff.count())` then inserts. Two concurrent creates at the boundary (`count=1`, `limit=2`) both read `1`, both pass (`1 >= 2` false), both insert → 3 staff. No DB constraint enforces the cap. Acceptable for a soft limit, but flag: for a hard cap use a per-tenant advisory lock (`pg_advisory_xact_lock`) or `SELECT … FOR UPDATE` on a tenant row around count+insert.

### M4 — Webhooks share the `/api` IP rate-limit bucket
`server.ts:95-103` mounts `rateLimit({ limit: 100 / 15min })` on `/api`; webhooks are `/api/v1/billing/webhooks/*` → covered. Provider webhook deliveries originate from a small set of provider IPs; under load they can exhaust the shared 100/15min bucket → **429 on legitimate webhooks** → delivery delay/backoff. Conversely it does bound a bad-signature HMAC flood (mild DoS, cheap per request). Recommend a dedicated limiter for the webhook route (higher/separate bucket, or keyed differently), decoupled from tenant API traffic.

---

## LOW

### L1 — `parseEvent` JSON.parse unguarded (currently unreachable, defensive)
`sepay.provider.ts:38`, `stripe.provider.ts:43` call `JSON.parse(rawBody)` with no try/catch. In practice unreachable via HTTP: `express.json` parses first and rejects malformed JSON with 400 before the controller runs, and a non-JSON content-type yields empty `rawBody` → 401. But `parseEvent` is documented "pure" and could be invoked with malformed input elsewhere. Wrap in try/catch → return `null` (→ 400) for robustness. (Note: 5xx are sanitized in prod — `error-handler.middleware.ts:65-71` — so no stack leak even today.)

### L2 — `applyPaymentEvent` return value discarded
`billing-webhook.controller.ts:45` ignores the `boolean`. Once C1/C2 are fixed, a `false` (referenced subscription missing) should be surfaced as retryable rather than swallowed as `{received:true}`.

---

## Verified good (do not change)
- Raw-body capture (`server.ts:75-77`) feeds signatures exactly; no re-serialization. Both verifiers compare against `req.rawBody`. Correct.
- HMAC compares are constant-time with length guards (`sepay:32-33`, `stripe:37-38`); empty/missing signature and empty rawBody → `false` → 401, no crash. Confirmed for both providers.
- `webhook-receipt.repository.ts:15-19` raw SQL is parameterized (`$1/$2`) — injection-safe.
- State machine `from === to` idempotent (`subscription-state-machine.ts:13`) — correct for replay/duplicate-status events.
- `dataSource`-vs-tenant-manager split (`subscription.repository.ts:11-13`) is a clean separation *in intent*; the defect is the missing tenant context on the write, not the structure.
- 5xx responses sanitized in prod (`error-handler.middleware.ts:67-70`) — no stack/driver leak.
- Authz: `/plans` any-member, `/subscription` TENANT_MEMBER (tenant-scoped `findActive`), `/subscribe` OWNER_ONLY, webhook unauthenticated+signature-gated. Subscription entity exposes no secret field. Correct.
- Migration reversible; drop order respects FKs (subscriptions before plans). OK.

---

## Blockers before Slice B / production
1. **C1** — webhook write/read has no tenant context under RLS FORCE; broken with any non-superuser prod role. Needs a BYPASSRLS system role or per-write `set_config`.
2. **C2** — claim-before-apply non-atomicity loses events on any apply failure/not-found.
3. **H2** — default webhook secret + no prod guard → forgeable webhooks if unset; must be required and per-provider.
4. **H1** — Stripe replay window unbounded.
5. **H4** — past_due → unlimited entitlement must be inverted before billing enforcement is trusted.

Add at least one integration test that runs against **RLS-enabled** schema with a **non-superuser** role for the webhook path — current `synchronize`/no-RLS harness cannot catch C1.

## Unresolved questions
1. Is `DB_USER` in prod a superuser / does it have `BYPASSRLS`? If yes, C1's read/write "works" but every RLS guarantee for the whole app is void. If no, the webhook path is dead. Which is the intended prod posture, and where is the system/bypass role provisioned?
2. Is a free subscription meant to be auto-created on tenant onboarding (M1)? If not, is "no plan = unmetered" the deliberate product decision, and does that not defeat the free-tier `maxStaff` cap?
3. Is `maxBookingsPerMonth` in scope for a later slice, or dead config to remove now (M2)?
4. Are Stripe and SePay expected to ever share one secret in this deployment, or is per-provider secret required before real integration (H2)?

---
**Status:** DONE_WITH_CONCERNS
**Summary:** Strategy/registry structure and signature verification are sound, but the webhook consume path has two Critical prod defects (no tenant context under RLS → silent no-op; claim-before-apply loses events) plus Stripe replay, shared/default secret, past_due escalation, and unenforced free limits.
**Concerns/Blockers:** C1, C2, H1, H2, H4 block production and Slice B. Current test harness (synchronize, no RLS, superuser) cannot detect C1 — add an RLS+non-superuser integration test.

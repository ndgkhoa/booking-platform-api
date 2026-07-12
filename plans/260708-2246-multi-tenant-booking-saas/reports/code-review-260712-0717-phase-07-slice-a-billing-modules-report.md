# Code Review — Phase-07 Slice A (post-split: plan / subscription / payment modules)

Read-only review. Change = `508e96e` (DTO rename) + `969f656` (billing split) on `6ecee9d`, branch `develop`. Reviewed current files as they stand + `git diff 6ecee9d..HEAD`. Prior review = `code-review-260711-1648-phase-07-slice-a-billing-report.md`.

**Verdict:** the split is clean. It carried across the previously-recommended fixes and **every prior Critical/High is now resolved in code**. No new Critical/High regression introduced. `tsc --noEmit` passes (exit 0). Remaining items are one test-coverage gap (Medium) + carry-over product questions + Low polish. The single biggest residual risk is that the C1/C2 fix is correct-by-inspection but **still not exercised by any RLS + non-superuser test** — a future refactor could silently break the tenant-tx wiring with the suite green.

---

## Prior fixes — VERIFIED HOLDING

| Prior | Status | Evidence |
|------|--------|----------|
| **C1** webhook write/read had no tenant context under RLS FORCE (silent no-op) | **FIXED** | `subscription.service.ts:77-89` `consumeWebhook` wraps claim + `findByReference` + `updateStatus` in one `runInTenantContext`. `runInTenantContext` (`tenant-transaction.ts:21-24`) opens a tx, `set_config('app.tenant_id',…,true)`, and publishes the tx `manager` via ALS. Both repos resolve `getTenantManager() ?? dataSource.manager` (`subscription.repository.ts:11-13`, `webhook-receipt.repository.ts:20`) → inside the context they run on the RLS-scoped tx connection. No raw-datasource query remains on the webhook path. |
| **C2** claim committed before apply → non-atomic, events lost | **FIXED** | `receipts.claim` now runs on the tenant tx manager (`webhook-receipt.repository.ts:20-25`) inside the same `runInTenantContext` as the subscription write. A throw or the illegal-transition/not-found early-return path either rolls back or commits together. On apply throw → tx rollback → claim rolled back → provider retry re-processes. |
| **H1** Stripe replay window unbounded | **FIXED** | `stripe.provider.ts:35-39` computes `ageSeconds` and rejects `> env.STRIPE_WEBHOOK_TOLERANCE_SECONDS` (default 300, `env.ts:26`). Non-numeric `t` → `NaN` → `!Number.isFinite` → reject. Unit-tested (`payment-provider.spec.ts:47-51`). |
| **H2** single shared webhook secret + dev default → forgeable if unset | **FIXED** | Split into `SEPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET`, both `str()` **no default → required** (`env.ts:24-25`); `.env.example:20-21` empty. Each provider uses its own secret (`sepay.provider.ts:29`, `stripe.provider.ts:40`). |
| **H3** `subscribe()` unique-race → 500 not 409 | **FIXED** | `subscription.service.ts:60-66` try/catch maps `code === '23505'` → `ConflictException`. |
| **H4** `past_due` → unlimited entitlement | **FIXED** | `entitlement.service.ts:31-38` returns `-1` (unmetered) **only** for missing/`Canceled`; `past_due` falls through to `plan.maxStaff`. Cap enforced on payment failure. `trialing→past_due` now a legal transition (`subscription-state-machine.ts:8`). |

## Verified-good, carried across the split (do not change)
- Constant-time HMAC compare with length guard on both providers (`sepay:31-32`, `stripe:43-44`); empty sig/body → `false`.
- Signatures verify against captured raw body (`server.ts:76`); no re-serialization.
- Idempotency SQL parameterized (`webhook-receipt.repository.ts:21-25`); dedup via `UQ_webhook_receipts (provider,event_id)` + `ON CONFLICT DO NOTHING RETURNING` serializes concurrent double-delivery.
- Concurrent-subscribe backstop `UQ_subscriptions_active` partial-unique (`1780299300000-Billing.ts:47-49`) + `23505` catch.
- `webhook_receipts` has no RLS/no tenant column (`Billing…:59-68`) → INSERT on the tenant-tx connection is **not** wrongly blocked for a non-superuser (focus #2 confirmed safe).
- State machine `from===to` idempotent (`subscription-state-machine.ts:17`).
- **Module boundaries clean:** no cross-module repository import (each repo imported only by its own service); `payment` is a leaf; `subscription→payment+plan`; `entitlement→SubscriptionService+PlanService`; no import cycle; `src/modules/billing/**` fully removed, no residual refs.
- Controllers/entitlement inject only services (grep: zero `Repository` in controllers/entitlement).
- Reference regex is `/i` and `randomUUID()` is lowercase-hex-with-dash → round-trips.

---

## MEDIUM

### M1 — RLS webhook path STILL untested (prior explicit recommendation not implemented)
`test/support/integration-context.ts:69` uses `synchronize: true` (no migration → **no RLS policy, no FORCE**), and the testcontainer connects as the default superuser. So `billing.e2e.spec.ts` exercises `consumeWebhook` with RLS absent: `findByReference` resolves by the globally-unique `provider_reference` regardless of `app.tenant_id`, and `set_config` is a harmless no-op.

Consequence: the C1/C2 fix is validated **only by inspection**. A future edit that drops `runInTenantContext`, or a repo that stops honoring `getTenantManager()`, would leave every test green while the production webhook path silently no-ops under RLS FORCE (the exact prod defect C1 described). The prior report asked for "at least one integration test against an RLS-enabled schema with a non-superuser role" — not added.

**Fix:** one integration test that runs the actual `Billing` migration (RLS policies + FORCE) and connects the webhook path as a non-`BYPASSRLS` role; assert the subscription activates (proves tenant re-entry) and that a foreign reference cannot. Confirm the intended prod `DB_USER` is non-superuser/non-BYPASSRLS (see Q1).

### M2 — Free-tier cap unenforced by default (carry-over; now documented as intent)
`entitlement.service.ts:33-34` + comment: a tenant with **no** subscription is unmetered. No onboarding path auto-provisions a free subscription (grep `src/modules/tenant`, `src/modules/auth` → none). So the seeded `free` plan (`maxStaff:2`) binds only if a tenant explicitly subscribes to it. Every tenant that never subscribes gets unlimited staff. This is now stated as a design choice in the comment, but materially defeats the free tier — confirm product intent (Q2). Not a split regression.

---

## LOW

### L1 — Not-found after claim commits the receipt → event consumed/lost
`subscription.service.ts:81-82`: if `claimEvent` succeeded (newly claimed) but `findByReference` returns `null`, the function returns normally → the surrounding tx **commits** → receipt persisted. Provider retry then `claim`→`false`→ no-op. Reachable if the reference's tenant is a valid UUID with no matching subscription (foreign/forged ref — signature-gated, so low), or a webhook that races ahead of the subscribe tx commit (ordering makes this improbable: checkout URL is returned only after `create`). Consider: on `!subscription`, `throw` (roll back the claim) so a genuinely-early delivery is retried, and rely on the illegal-transition ACK-drop for true no-ops. Weigh against re-introducing a retry loop for permanently-foreign refs.

### L2 — `tenantFromReference` regex looser than a UUID
`subscription-reference.ts:13` `^sub_([0-9a-f-]{36})_` matches any 36 hex/dash chars, not a well-formed UUID. A signed-but-malformed reference (e.g. `sub_<36 dashes>_…`) yields a non-UUID `tenantId` → `set_config` succeeds → the first RLS query's `current_setting('app.tenant_id')::uuid` cast throws → tx aborts → 500 → provider retry loop (claim rolled back, so it repeats). Only reachable with a valid signature over a malformed reference, which neither provider emits. Tighten to a strict UUID pattern and return `null` (→ ignored as foreign) instead of risking a 5xx retry loop.

### L3 — Stripe verifier only checks the last `v1`
`stripe.provider.ts:29-33`: `Object.fromEntries(... split('='))` collapses duplicate keys, keeping the **last** `v1`. Stripe emits multiple `v1` during secret rotation; this validates only one, so a legitimately-signed delivery could be rejected mid-rotation. Iterate all `v1` values and accept if any matches.

### L4 — e2e hardcodes the secret with a stale comment
`billing.e2e.spec.ts:8` `const SEPAY_SECRET = 'dev-sepay-secret'; // matches SEPAY_WEBHOOK_SECRET env default`. There is **no** env default anymore (H2 made it required). The comment is misleading and the test breaks if CI sets a different `SEPAY_WEBHOOK_SECRET`. Read `env.SEPAY_WEBHOOK_SECRET` like the unit spec (`payment-provider.spec.ts:8`) and drop the comment.

### L5 — Dead code left by the split
`subscription-state-machine.ts:20-24` exports `assertCanTransition` (and the sole use of its `UnprocessableStateException` import), but `consumeWebhook` uses `canTransition` and nothing references the subscription `assertCanTransition` (grep: only `booking`'s namesake is used). Remove it, or wire it where a hard 422 is wanted.

### L6 — `maxBookingsPerMonth` still dead config (carry-over)
Defined/seeded (`plan.entity`, `Billing…:19,72`) but enforced nowhere (grep outside entity/migration/test → none). Wire into booking-create or drop from the slice.

### L7 — `parseEvent` `JSON.parse` unguarded (carry-over, defensive)
`sepay.provider.ts:37`, `stripe.provider.ts:49`. Unreachable via HTTP (`express.json` rejects malformed body first), but the interface documents `parseEvent` as pure. Wrap → return `null`.

---

## Focus-area answers
1. **Tenant-tx atomicity:** correct. Claim + read + write share one `runInTenantContext` tx/connection via ALS `manager`; no independent-commit path remains. (M1: unverified by test.)
2. **RLS correctness:** no webhook query runs on the raw datasource inside the context; `webhook_receipts` (no RLS) is not wrongly blocked. Correct.
3. **Reference parsing:** round-trips; loose regex → L2 (signed-only, low). Not forgeable without the provider secret; no cross-tenant read (RLS-scoped `findByReference`).
4. **Concurrency:** `23505` backstop + catch (subscribe); `ON CONFLICT DO NOTHING` on unique `(provider,event_id)` serializes double-webhook. Sound.
5. **Signatures:** constant-time + length guard both providers; Stripe freshness bounded; per-provider secrets isolated; header read raw. Sound (L3 rotation nit).
6. **Module boundaries:** no layering violation, no cycle, no dead `billing/` residue. Clean.
7. **DTO/route rename:** `CreateSubscriptionDto @IsIn(['sepay','stripe'])` → unknown provider 422 before registry (`billing.e2e.spec.ts:174`); routes `GET /plans` (auth any-member), `POST/GET /subscriptions[/current]` (OWNER_ONLY / TENANT_MEMBER), `POST /payments/webhooks/:provider` (unauth+signature). Intact.

---

## Unresolved questions
1. Is the prod `DB_USER` non-superuser / non-`BYPASSRLS`? The whole C1 fix (and every RLS guarantee) depends on it. Where is that role provisioned? (Blocks M1 test being meaningful.)
2. Is a free subscription meant to be auto-created on tenant onboarding? If not, "no plan = unmetered" is deliberate and the free `maxStaff` cap is decorative (M2).
3. `maxBookingsPerMonth` — later slice or remove now (L6)?
4. Do Stripe deliveries in this deployment ever send multiple `v1` (secret rotation)? If yes, L3 should be fixed before real integration.

---
**Status:** DONE_WITH_CONCERNS
**Summary:** The three-module split is clean and carried across all prior fixes — C1, C2, H1, H2, H3, H4 verified resolved; boundaries/cycle/dead-`billing` all good; typecheck passes. No new Critical/High. Residual: RLS webhook path still untested (Medium — fix correct only by inspection), free-tier cap unenforced (product Q), plus Low polish (not-found-commits-receipt, loose ref regex, Stripe multi-v1, hardcoded test secret, orphaned `assertCanTransition`).
**Concerns/Blockers:** none blocking merge of the split itself; before trusting billing in prod, add the RLS + non-superuser webhook test (M1) and confirm Q1/Q2.

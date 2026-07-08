# Phase 8 — Payments (Stripe + SePay)

## Context links
- Depends on Phase 7 (plan) + Phase 4 (booking for deposits). Verified usage via context7 (Stripe stripe-node v19.x).

## Overview
- **Priority:** high (CV differentiator) · **Status:** pending.
- Stripe (test mode) subscription billing for Pro + booking deposits; SePay (sandbox) VietQR deposits. Both free in test/sandbox.

## Key insights (context7-verified)
- Stripe webhook needs the **raw body**: `stripe.webhooks.constructEvent(rawBody, sig, secret)`. Mount `express.raw({type:'application/json'})` on the webhook path **before** the global `express.json()` — dedicated route `/api/v1/payments/stripe/webhook`.
- Idempotency on writes via `{ idempotencyKey }` option. `checkout.sessions.create({ mode: 'subscription' | 'payment' })`.
- Webhook processing must be **idempotent** (dedup by Stripe event id) — store processed event ids.

## Architecture
- `modules/payment/*`: `payment.entity` (provider, external_id, amount, currency, status, booking_id?/subscription?), `stripe.service`, `sepay.service`, `payment.controller`, `stripe-webhook.controller` (raw body), `sepay-webhook.controller`.
- Stripe: create Checkout for Pro subscription; on `checkout.session.completed` / `customer.subscription.*` → set `tenant.plan = pro` (reconcile). Booking deposit = Checkout `mode: payment` tied to booking id.
- SePay: create VietQR for deposit; verify IPN signature; mark payment paid.
- `processed_webhook_events` (provider, event_id unique) for dedup.

## Server wiring
- In `src/server.ts`, register the Stripe webhook route with `express.raw` before `express.json()`; keep everything else on JSON.

## Todo
- [ ] `stripe` SDK + Pro subscription Checkout
- [ ] Stripe webhook (raw body + verify + dedup) → flip `tenant.plan`
- [ ] Booking deposit (Stripe payment mode)
- [ ] SePay sandbox VietQR + IPN verify
- [ ] Payment + processed-events entities
- [ ] Tests: Stripe CLI test event flips plan; idempotent webhook; SePay sandbox

## Success criteria
- Test-mode: upgrade to Pro via Checkout → webhook sets plan=pro; deposit paid marks booking; duplicate webhook event processed once; SePay sandbox QR paid → deposit recorded.

## Risks
- Raw-body ordering bug is the classic failure — assert signature verification in an integration test with a mismatched body.
- Never log secrets/keys; test keys only in `.env` (gitignored).

## Next
- Phase 9 traces/audits payment flows; Phase 10 documents billing.

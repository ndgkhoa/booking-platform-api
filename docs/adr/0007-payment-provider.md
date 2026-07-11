# ADR 0007 — Payment provider abstraction (SePay + Stripe)

**Status:** Accepted · **Date:** 2026-07-11

## Context

Tenants subscribe to plans and pay. Two markets matter: Vietnam (VietQR bank
transfer via **SePay**) and global cards/subscriptions (**Stripe**). We do not
want provider lock-in, and each provider has a different checkout model and a
different webhook signature scheme.

## Decision

Support **both** providers behind a single `PaymentProvider` **Strategy**
interface. The billing domain depends only on the interface; concrete providers
are adapters selected at runtime by name from a `PaymentProviderRegistry`.

```
PaymentProvider (Strategy)
 ├─ SepayProvider   — VietQR checkout, HMAC-SHA256 webhook signature
 └─ StripeProvider  — hosted-checkout reference, Stripe t=…,v1=… signature
PaymentProviderRegistry.get(name) → PaymentProvider   (Registry/Factory)
```

The interface is intentionally minimal and provider-agnostic:
- `createCheckout(input)` → a `CheckoutSession` (reference + instructions). The
  caller supplies a `sub_<tenantId>_<random>` reference so the tenant travels
  with the payment and can be recovered on the (auth-less) webhook.
- `verifyWebhook(rawBody, signature)` → boolean (constant-time). Each adapter
  owns its own webhook secret (`SEPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET`)
  so a leak of one provider's secret cannot forge the other's events. Stripe
  additionally rejects signatures outside a freshness window to bound replay.
- `parseEvent(rawBody)` → a normalised `PaymentEvent` (`payment.succeeded` /
  `payment.failed` + subscription reference), or null if irrelevant.

Inbound webhooks are unauthenticated but **signature-gated** and consumed
**idempotently**. The tenant is decoded from the event reference, then the
receipt claim (event-id dedup) and the subscription state-machine transition run
in **one tenant-scoped transaction** — RLS covers the write, and a failed apply
rolls the claim back so the provider's retry can re-process it.

## Consequences

- **+** No lock-in; adding a provider = one adapter + one registry entry.
- **+** Provider differences (checkout shape, signature format, event names) are
  isolated in the adapter; the domain sees one normalised event.
- **+** Signature verification and event parsing are pure and unit-testable
  without live provider calls.
- **−** The lowest-common-denominator interface can't express every
  provider-specific capability; provider-only features would need interface
  growth or an escape hatch.
- PCI: both use **provider-hosted checkout** — no raw card data touches this API.

## Alternatives considered

- **Single provider (SePay-only or Stripe-only):** simpler, but fails one of the
  two target markets and re-introduces lock-in.
- **Per-provider branching in the billing service (`if provider === …`):**
  scatters provider logic across the domain; rejected in favour of the Strategy.

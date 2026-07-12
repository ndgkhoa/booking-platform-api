# Phase 07 — Billing, Subscription & Super-Admin

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-01](phase-01-auth-rbac-membership-invite.md), [phase-03](phase-03-availability-booking-core.md)
- Existing: Outbox + webhook infra (phase-04), RLS (phase-00).

## Overview
- **Priority:** P2
- **Status:** done (Slice A billing + Slice B super-admin)
- **Description:** Tenant subscription plans + billing via payment provider (ADR: SePay vs Stripe), plan-based limits/entitlements, and super-admin console for cross-tenant management (list/suspend tenants, impersonate-audit).

## Key Insights
- **Payment provider is an open decision** → write ADR, do not hardcode. SePay (VietQR, VN, Asia/Saigon context) vs Stripe (global cards/subscriptions). Recommend SePay if VN-first; Stripe if global SaaS. Abstract behind a `PaymentProvider` interface either way (DRY, swappable).
- Provider webhooks (payment success/failure) are inbound → verify signature; consume idempotently (reuse idempotency infra) and update subscription state.
- Entitlements: plan defines limits (max staff, max bookings/mo, features). Enforce via a guard/service reading tenant's plan — fail closed on overage.
- **super_admin cross-tenant access is security-critical** (open question #3): either a BYPASSRLS system path or explicit per-tenant `SET app.tenant_id`. Prefer explicit tenant-set with full audit log over blanket bypass.
- Subscription state machine: trialing → active → past_due → canceled (mirror provider). Guard transitions.

## Requirements
**Functional**
- Plans catalog (global): name, price, entitlement limits.
- Tenant subscribes → provider checkout/session → webhook confirms → subscription active.
- Entitlement enforcement (e.g. block staff creation over plan limit).
- super_admin: list tenants, view/suspend/reactivate, view subscription status, audited access.

**Non-functional**
- Billing webhooks idempotent + signature-verified. Super-admin actions audit-logged.

## Architecture
```
PaymentProvider interface  ── SePayProvider | StripeProvider (adapter)
Subscribe → provider checkout → inbound webhook (signed, idempotent) → SubscriptionService.apply(event)
Entitlement guard → PlanService.check(tenant, feature/limit) → 402/403 on overage
super_admin console → SET app.tenant_id per target (audited) OR system role
```
- **Data flow:** provider events → subscription state; plan → entitlement checks gate tenant mutations; super_admin acts across tenants via audited privileged path.

## Related Code Files
**Create**
- `src/modules/billing/payment-provider.interface.ts` — checkout, verifyWebhook, parseEvent.
- `src/modules/billing/providers/sepay.provider.ts` OR `stripe.provider.ts` (per ADR).
- `src/modules/billing/plan.entity.ts` (`plans`, global), `subscription.entity.ts` (`subscriptions`, tenant-scoped), `subscription-status.enum.ts`, `subscription-state-machine.ts`.
- `src/modules/billing/{billing.service,billing.controller,subscription.repository}.ts` + webhook controller.
- `src/modules/billing/entitlement.service.ts` + `entitlement.guard.ts` (or decorator).
- `src/modules/admin/admin.controller.ts` — super_admin tenant management.
- `src/modules/admin/admin.service.ts` + `src/modules/admin/audit-log.entity.ts` (`admin_audit_logs`).
- `src/database/migrations/{ts}-billing-and-admin.ts`.
- `docs/adr/0007-payment-provider.md` (decision record).

**Modify**
- `src/server.ts` authorizationChecker — super_admin already bypasses (phase-01); ensure admin routes require it.
- Staff/service/booking create paths — call entitlement check where limits apply.

**Delete** — none.

## Implementation Steps
1. ADR: choose SePay vs Stripe (blocked on open question #1). Define `PaymentProvider` interface regardless.
2. Plans + Subscriptions entities/migration; subscription state machine.
3. Provider adapter: checkout session + webhook verify + event parse.
4. Inbound webhook controller: verify signature, idempotent consume, apply to subscription.
5. EntitlementService + guard; wire into limited mutations (staff/booking caps).
6. Super-admin: list/suspend/reactivate tenants via audited privileged DB path; audit-log every action.
7. Tests: webhook signature + idempotency, entitlement overage block, subscription transitions, super-admin audit + isolation.

## Resolved open questions
- **Payment provider:** BOTH SePay + Stripe behind a `PaymentProvider` **Strategy** (ADR 0007). No lock-in; adapters isolate checkout shape, signature scheme, event format.
- **super_admin cross-tenant:** explicit per-tenant `SET app.tenant_id` + audit log (NOT blanket BYPASSRLS) — Slice B.

## Todo
**Slice A — billing (done):**
- [x] ADR `docs/adr/0007-payment-provider.md` (Strategy decision)
- [x] `PaymentProvider` interface (Strategy) + `SepayProvider` (VietQR checkout, HMAC-SHA256 sig) + `StripeProvider` (hosted checkout, `t=,v1=` sig) + `PaymentProviderRegistry` (Factory/Registry selecting by name)
- [x] Plans (global) + Subscriptions (tenant-scoped, RLS, one active per tenant) + subscription state machine (trialing→active→past_due→canceled)
- [x] Inbound billing webhook: raw-body signature verify + system-level idempotency (`webhook_receipts` unique on provider+event id) → state machine
- [x] EntitlementService (fail-closed, unmetered when no plan) wired into StaffService.create (402 PLAN_LIMIT_EXCEEDED over plan cap)
- [x] Migration billing (+RLS, seed free/pro plans, reversible)
- [x] Unit: both providers' signature+event parse; e2e: subscribe→signed-webhook→active, bad-sig 401, idempotent replay, entitlement 402, unknown-provider 422 — 40 unit + 72 integration green

**Slice B — super-admin (done):**
- [x] Super-admin console (`admin` module): list/suspend/reactivate tenants + view tenant detail; subscription read via audited explicit per-tenant `SET app.tenant_id` (no BYPASSRLS)
- [x] `admin_audit_logs` immutable (DB rules discard UPDATE/DELETE); suspend/reactivate write status + audit atomically in one tx
- [x] Suspended-tenant gate in `TenantContextMiddleware` (403); class-level `@Authorized(SUPER_ADMIN_ONLY)` on all admin routes
- [x] Migration (reversible, verified up/down); e2e: list/detail, suspend→reactivate+audit, suspended→403, non-super_admin→403 — 41 unit + 77 integration green

## Success Criteria
- Subscribe → webhook → subscription active; replayed webhook is no-op.
- Over-limit action blocked (402/403) with stable errorCode.
- super_admin can suspend a tenant; every cross-tenant action audit-logged.
- Non-super_admin cannot reach admin routes.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Provider lock-in | Med×Med | PaymentProvider interface adapter |
| Webhook spoofing | Med×High | Signature verify + idempotent consume |
| super_admin RLS bypass leaks/edits wrong tenant | Med×High | Explicit per-tenant SET + audit; least privilege |
| Entitlement bypass | Med×Med | Fail-closed checks at mutation points + tests |

## Security Considerations
- Payment secrets in env only (never committed). PCI: prefer provider-hosted checkout (no raw card data).
- super_admin path least-privilege + immutable audit log.
- Webhook endpoints unauthenticated but signature-gated + rate-limited.

## Next Steps
- Final domain layer. Hardened + documented in phase-08.

# Phase 07 — Billing, Subscription & Super-Admin

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-01](phase-01-auth-rbac-membership-invite.md), [phase-03](phase-03-availability-booking-core.md)
- Existing: Outbox + webhook infra (phase-04), RLS (phase-00).

## Overview
- **Priority:** P2
- **Status:** pending
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

## Todo
- [ ] ADR 0007 payment provider (resolve open question)
- [ ] PaymentProvider interface + chosen adapter
- [ ] Plans + Subscriptions entities + migration
- [ ] Subscription state machine
- [ ] Inbound billing webhook (signed + idempotent)
- [ ] EntitlementService + guard wired into limited ops
- [ ] Super-admin console + audit log
- [ ] Billing/entitlement/admin tests

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

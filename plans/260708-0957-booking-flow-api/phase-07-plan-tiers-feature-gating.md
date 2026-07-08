# Phase 7 — Plan tiers & feature gating (SaaS)

## Context links
- Depends on Phase 1 (tenant). Sets up Phase 8 (billing flips the plan).

## Overview
- **Priority:** high (SaaS business logic) · **Status:** pending.
- Free/Pro tiers with enforced limits and feature flags — no payment yet (Phase 8 wires billing).

## Requirements
- Functional: `tenant.plan` (`free|pro`); limits per plan (max staff, max bookings/month, webhooks on/off, recurring on/off); block actions over quota with 402/403.
- Non-functional: usage counters accurate and cheap to read.

## Architecture
- Plan limits config map (code-level, not per-tenant rows initially).
- `@RequiresPlan('pro')` / `@EnforcesQuota('bookings')` guard using tenant context.
- Usage counters in Redis (monthly booking count keyed `usage:{tenant}:{yyyymm}`) with DB reconciliation.
- Custom `QuotaExceededException` (402).

## Todo
- [ ] Plan enum + limits config
- [ ] Quota guard/decorator + usage counters
- [ ] Gate webhooks + recurring behind Pro
- [ ] Tests: Free hits limit → blocked; Pro unlocked

## Success criteria
- Free tenant blocked at staff/booking limit and webhook creation; Pro tenant unlocked; tests green.

## Risks
- Counter drift under concurrency → increment atomically (Redis INCR) inside/after the booking commit; nightly reconcile from DB.

## Next
- Phase 8 subscription webhook sets `tenant.plan = pro`.

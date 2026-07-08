---
title: "Multi-Tenant Booking SaaS API"
description: "Evolve Express/TypeStack boilerplate into a phased, tenant-isolated booking platform with EXCLUDE-based double-booking prevention."
status: pending
priority: P1
effort: ~18-24d
branch: main
tags: [multi-tenant, booking, saas, postgres, rls, exclude-constraint]
created: 2026-07-08
---

# Multi-Tenant Booking SaaS API

Build ON existing stack (Express4 + routing-controllers + TypeDI + TypeORM + PG + BullMQ + passport-jwt). Do NOT re-plan existing auth/user/email/metrics/health. Each phase independently shippable.

## Core Architecture Pillars
1. **Tenant isolation (defense-in-depth):** AsyncLocalStorage tenant context + `BaseTenantRepository` auto-filter (Layer 1) + Postgres RLS `SET LOCAL app.tenant_id` (Layer 2). All uniques/indexes lead with `tenant_id`.
2. **Double-booking prevention:** PG `EXCLUDE USING gist` (btree_gist) on `bookings`, map SQLSTATE `23P01` → 409. Flagship. Concurrency test asserts exactly-1-wins.
3. **RBAC via Membership:** role moves OUT of `users.roles` into `memberships(user_id,tenant_id,role)`. Customers = separate tenant-scoped table.
4. **Reliability:** Transactional Outbox for status-change events, Idempotency-Key on POST /bookings, `@VersionColumn` optimistic lock on reschedule/cancel.

## Phases

| # | Phase | Status | Depends | File |
|---|-------|--------|---------|------|
| 00 | Foundation: tenant context (ALS), RLS mechanism, BaseTenant entity/repo, /api/v1, Tenant+Membership schema. (OTel/RFC7807/self-registration = follow-on slices) | ✅ core done | — | [phase-00](phase-00-tenant-foundation-and-rls.md) |
| 01 | Auth + JWT `tenant_id` claim + **tenant-context middleware** + RBAC via Membership + **drop user.roles** + email invite + **refresh-token rotation & reuse detection** | pending | 00 | [phase-01](phase-01-auth-rbac-membership-invite.md) |
| 02 | Services + Staff + staff-service link + working hours + time-off + **RLS policies & cross-tenant isolation test** (first tenant-scoped tables) | pending | 00,01 | [phase-02](phase-02-services-staff-working-hours.md) |
| 03 | **CORE**: AvailabilityService + Booking + EXCLUDE + state machine + idempotency + optimistic lock (+ **ETag/If-Match**) + concurrency tests | pending | 02 | [phase-03](phase-03-availability-booking-core.md) |
| 04 | Notifications: Outbox + email confirm/reminder + internal webhook | pending | 03 | [phase-04](phase-04-outbox-notifications-webhooks.md) |
| 05 | Reporting/analytics (bookings/revenue by time/service/staff) | pending | 03 | [phase-05](phase-05-reporting-analytics.md) |
| 06 | Recurring bookings | pending | 03 | [phase-06](phase-06-recurring-bookings.md) |
| 07 | Billing + subscription + super-admin tenant management | pending | 01,03 | [phase-07](phase-07-billing-subscription-superadmin.md) |
| 08 | Hardening: k6 load test, ADRs, docs sync, OpenAPI polish, **README diagrams + engineering narrative, live demo deploy, security scan CI, CI quality gates** | pending | all | [phase-08](phase-08-hardening-k6-adr-docs.md) |

## Cross-Cutting Conventions (reuse, do not duplicate)
- **Architecture = Pragmatic Modular** (layered + pure domain extracted only for availability/state/value-objects). See `docs/code-standards.md` → Architecture. NOT full hexagonal.
- **Naming = enforced** via Biome `useNamingConvention` (enable in phase-00 alongside the refactor). Interfaces: no `I` prefix. Full spec + design-pattern↔call-site map in `docs/code-standards.md` + `docs/design-patterns.md`.
- Extend `BaseEntity` (uuid + soft-delete). New `BaseTenantEntity` adds `tenant_id` + composite lead index.
- All DB access in `*.repository.ts`; services never touch QueryBuilder. Tenant repos extend `BaseTenantRepository`.
- Errors via existing `AppException` subclasses (stable `errorCode`). Add `UnprocessableStateException` (booking transitions) if needed.
- Value Objects: `TimeRange`, `Money` (integer minor units, never float) in `@common/value-objects`.
- **Observability:** OpenTelemetry distributed tracing (phase-00) — spans across HTTP→service→BullMQ→worker; `trace_id` in every log line (supersedes plain correlation-id).
- **Error format:** RFC 7807 `application/problem+json` for errors (phase-00 error-handler); success envelope unchanged.
- **Senior add-ons** (opted in): see [`enhancements-backlog.md`](enhancements-backlog.md) — Tier 1 (README diagrams/narrative, live demo, RFC 7807, security scan CI, CI gates), OTel tracing, refresh-token rotation+reuse detection, ETag/If-Match. Mutation/property testing deferred.
- Keep code files <200 lines; modularization boundaries noted per phase.
- Code/migration names must NOT reference phase numbers or finding codes.

## Global Risks
| Risk | L×I | Mitigation |
|------|-----|-----------|
| RLS misconfig leaks cross-tenant data | Med×High | RLS integration test per tenant table; app-layer filter as backstop; deny-by-default policy |
| Timezone/DST bugs in availability | High×High | Store UTC; compute in tenant TZ via `Intl`/luxon; explicit DST test cases |
| Outbox never dispatched (worker down) | Med×Med | Relay poller + metrics on outbox lag; dead-letter after N retries |
| Migration ordering (btree_gist ext) | Low×High | Dedicated first migration `CREATE EXTENSION btree_gist`; verify in CI |
| User model rework breaks existing auth | Med×High | Phase-00 migration + backfill; keep `users` row shape, drop `roles` last |

## Resolved Decisions (locked)
- Customer = tenant-scoped table. Double-booking = PG `EXCLUDE`. Tenant isolation = RLS + app-filter.
- Architecture = Pragmatic Modular. Interface naming = no `I` prefix, Biome-enforced.

## Open Questions
See end of this section — top 3:
1. **Payment provider**: SePay (VietQR, VN context) vs Stripe? Blocks phase-07 ADR. Recommend SePay given Asia/Saigon TZ + VN market; Stripe if global.
2. **Tenant resolution source**: JWT `tenant_id` claim only, or also subdomain/header fallback for multi-tenant users switching orgs? Affects phase-00 middleware + token re-issue on tenant switch.
3. **super_admin cross-tenant access**: does super_admin bypass RLS (BYPASSRLS role / separate connection) or explicitly `SET app.tenant_id` per target tenant? Security-sensitive; needs decision before phase-07.

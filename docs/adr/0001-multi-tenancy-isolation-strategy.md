# ADR-0001: Multi-tenancy isolation strategy

- **Status:** accepted
- **Date:** 2026-07-08

## Context

The platform serves many independent businesses (tenants) — spas, clinics, gyms, salons — on shared infrastructure. Tenant data (services, staff, bookings, customers) must never leak across tenants. We need an isolation model that balances strong safety, operational simplicity, cost, and migration ergonomics as tenant count grows.

## Decision

**Shared database, shared schema, row-level isolation by `tenant_id`, enforced in two layers:**

1. **Application layer** — a request-scoped tenant context (`AsyncLocalStorage`) resolved from the JWT `tenant_id` claim (optionally a subdomain / `X-Tenant` header). A tenant-scoped base repository automatically injects `tenant_id` into every read filter and sets it on every write.
2. **Database layer (defense-in-depth)** — PostgreSQL Row-Level Security (RLS) policies on all tenant-owned tables using `current_setting('app.tenant_id')`. The GUC is set per transaction. Even if application code forgets a filter, the database refuses cross-tenant rows.

## Alternatives considered

- **Schema-per-tenant** — stronger isolation, but migrations must fan out across N schemas and connection routing adds complexity; overkill at this stage.
- **Database-per-tenant** — maximum isolation, heaviest operational cost (backups, migrations, connections per tenant); reserved for enterprise/regulated tenants only.
- **App-layer scoping only (no RLS)** — simplest, but a single missing `WHERE tenant_id` is a data breach. Unacceptable for the core safety property.

## Consequences

- **Positive:** one schema and one migration path; cheap to scale to many small tenants; RLS is a hard backstop that makes cross-tenant leaks structurally difficult; app-layer scoping keeps queries ergonomic.
- **Trade-offs:** every tenant-owned table carries `tenant_id` + index; the DB connection must set the tenant GUC on each request/transaction; noisy-neighbor at extreme scale is possible (mitigated later by per-tenant rate limits and, if needed, tenant sharding).
- **Follow-ups:** base repository + tenant-context middleware; RLS migration; isolation tests that assert tenant A cannot read tenant B even with the app filter bypassed.

## Enforcement status & sequencing

- **Enforced today:** the **application layer**. Every tenant query is scoped by the request's `tenantId`; the authorization checker re-validates membership from the DB per request.
- **RLS backstop:** the policy, the `app_user` role, and the `withTenantTransaction` GUC helper exist and are proven by the isolation test, but RLS is **not yet enforced in the runtime path** — the app currently connects as a superuser (RLS does not apply to superusers). Wiring RLS into the request path (connect as non-superuser `app_user`, open a per-request tenant transaction that sets `app.tenant_id`) lands with the **first tenant-owned business tables (Phase 3)**, and migrations continue to run as the table owner.
- **Identity tables** (`users`, `tenant_members`, `refresh_tokens`) are traversed **cross-tenant by auth** (login resolves a user's tenant *from* `tenant_members`), so they are protected by app logic + constraints, not RLS.
- **Sanctioned cross-tenant path:** the platform super admin (`users.platform_role`) operates on a dedicated `/admin` surface only (see phase-01b); when RLS is live those routes use a `BYPASSRLS`/superuser connection and are audited.

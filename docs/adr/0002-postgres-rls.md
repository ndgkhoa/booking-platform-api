# ADR 0002 — Postgres RLS as defense-in-depth for tenant isolation

**Status:** Accepted · **Date:** 2026-07-08

## Context

Every tenant-scoped table holds many tenants' rows in one database. A single
missing `WHERE tenant_id = …` — in an ad-hoc query, a new repository method, a
reporting join — leaks or corrupts another tenant's data. Relying only on
application discipline makes correctness depend on every future line of code.

## Decision

Two independent layers, both required:

1. **Application filter (Layer 1):** an AsyncLocalStorage tenant context plus a
   `BaseTenantRepository` that injects `tenant_id` into every query. Fast, and it
   fails closed if no tenant is in context.
2. **Postgres RLS (Layer 2):** every tenant table has `ENABLE` + `FORCE ROW LEVEL
   SECURITY` and a policy `tenant_id = current_setting('app.tenant_id')::uuid`.
   `TenantContextMiddleware` opens a per-request transaction and issues
   `SET LOCAL app.tenant_id`, so RLS filters every statement on that connection —
   even a query that forgot its `WHERE`.

`FORCE` makes the policy apply to the table owner too; the setting is
transaction-local (`SET LOCAL`) so it never leaks across pooled connections.

## Consequences

- **+** A forgotten tenant filter can no longer leak data — the database refuses
  cross-tenant rows. Isolation is proven by an RLS integration test.
- **+** Deny-by-default: with no `app.tenant_id` set, policies match nothing.
- **+** The privileged super-admin path must *explicitly* set a target tenant
  (audited), rather than silently seeing everything.
- **−** Tenant work must run inside the per-request transaction; a query on a raw
  pool connection sees nothing (a deliberate, discoverable failure).
- **−** Slight per-request cost (one `set_config`) and the connection is held for
  the request's duration.

## Alternatives considered

- **Application filter only:** one missed `WHERE` is a breach; no safety net.
- **Database-per-tenant:** strongest isolation but heavy operationally
  (migrations × N, connection sprawl) and overkill for the target scale.
- **A `BYPASSRLS` role for admin/system paths:** convenient but turns the safety
  net off exactly where cross-tenant power is greatest; rejected in favour of
  explicit, audited per-tenant `SET` (see ADR 0007 / super-admin console).

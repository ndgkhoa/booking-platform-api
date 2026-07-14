# ADR 0003 — Customer as a tenant-scoped table, distinct from Membership

**Status:** Accepted · **Date:** 2026-07-08

## Context

Two very different kinds of "person" exist around a tenant: **staff/owners** who
log in and operate the business, and **customers** who get booked. Early designs
often conflate them into one `users` table with a role, but they differ in
identity, authentication, uniqueness scope, and lifecycle.

## Decision

Model them separately:

- **Membership** (`memberships(user_id, tenant_id, role)`): the join between a
  global `users` identity and a tenant, carrying the authorization role
  (`owner` / `staff`). Role lives here — **not** on `users` — so the same person
  can hold different roles in different tenants. `super_admin` is a separate
  global flag on `users`.
- **Customer** (`customers`, tenant-scoped, RLS): a person the tenant books. Not
  a login identity. Uniqueness (e.g. email) is scoped *within* a tenant — the
  same email can be a customer of many tenants independently.

Bookings reference a `customer_id` and a `staff_id`; staff derive from
membership, customers do not.

## Consequences

- **+** Role is per-tenant and lives in one place; a user can own tenant A and be
  staff in tenant B without contradiction.
- **+** Customer records are fully tenant-isolated (RLS) and never accidental
  login identities; no password/credential surface on customers.
- **+** Customer uniqueness scoped per tenant matches reality (shared emails
  across unrelated businesses).
- **−** Two person-like tables plus membership; a booking touches both.
- **−** If a customer later needs a login (self-service portal), that's a new
  identity link, not a column flip.

## Alternatives considered

- **One `users` table with a `role` column:** breaks for multi-tenant users,
  forces global email uniqueness, and mixes login identities with booked people.
- **Customers as global with a tenant link table:** invites cross-tenant leakage
  of customer PII and complicates per-tenant uniqueness; rejected for a plain
  tenant-scoped table under RLS.

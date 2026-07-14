# Architecture Decision Records

Short records of the locked, load-bearing decisions — the *why* behind the
design. Each: context, decision, consequences, alternatives considered.

| # | Decision |
|---|----------|
| [0001](0001-exclude-over-locking.md) | `EXCLUDE` constraint over application locking for double-booking |
| [0002](0002-postgres-rls.md) | Postgres RLS as defense-in-depth for tenant isolation |
| [0003](0003-tenant-model-customer-vs-membership.md) | Customer as a tenant-scoped table, distinct from Membership |
| [0004](0004-transactional-outbox.md) | Transactional outbox for domain events |
| [0005](0005-timezone-utc-storage.md) | UTC storage, tenant-timezone compute, DST-safe math |
| [0006](0006-money-integer-minor-units.md) | Money as integer minor units |
| [0007](0007-payment-provider.md) | Payment provider abstraction (SePay + Stripe Strategy) |

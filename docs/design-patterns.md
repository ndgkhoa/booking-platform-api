# Design Patterns

Patterns applied in this codebase, each with its intent and call-site. Rule: a pattern earns its place by removing duplication or isolating change — never added for show (YAGNI).

## Structural / creational

| Pattern | Where | Intent |
|---------|-------|--------|
| **Repository** | `*.repository.ts` | Sole owner of ORM access; services stay persistence-agnostic. |
| **Template Method** | `BaseTenantRepository` | Base defines tenant-scoped query flow; subclasses fill specifics. Auto-applies `tenant_id` from context. |
| **Value Object** | `Money`, `TimeRange` (`@common/value-objects`) | Encapsulate invariants (money = integer minor units, never float; time range validates `start < end`). Immutable, equality by value. |
| **Factory** | `@database/factories/*`, token creation | Centralize construction of entities/tokens; keep tests DRY. |
| **Adapter** | payment client (SePay/Stripe), internal webhook client | Wrap external I/O behind a stable internal interface. |
| **DI (constructor injection)** | TypeDI `@Service()` everywhere | Invert dependencies; swap impls in tests. |

## Behavioral

| Pattern | Where | Intent |
|---------|-------|--------|
| **Strategy** | `PaymentProvider` interface + SePay/Stripe impls; notification channels; availability rule set | Select algorithm/impl at runtime without touching callers. |
| **State** | Booking status machine (`pending → confirmed → completed / cancelled / no_show`) | Explicit transition table + guards (`canTransitionTo`); no status logic scattered as `if`s across services. |
| **Chain of Responsibility** | Express/routing-controllers middleware pipeline (auth → tenant-context → validation → handler) | Compose cross-cutting concerns as ordered, single-purpose links. |
| **Decorator** | routing-controllers (`@Get`, `@Body`), class-validator | Declarative routing/validation metadata. |

## Reliability / data patterns

| Pattern | Where | Intent |
|---------|-------|--------|
| **Transactional Outbox** | booking status-change events → email + webhook | Write event in the same DB transaction as the state change; a relay dispatches to BullMQ. Kills the dual-write race (commit-then-enqueue). |
| **Unit of Work** | `QueryRunner` transaction around booking create/reschedule | All-or-nothing; rollback on conflict (`23P01`). |
| **Optimistic Locking** | `@VersionColumn` on `Booking` | Detect concurrent reschedule/cancel; retry or 409. |
| **Idempotency Key** | `POST /bookings` (`Idempotency-Key` header) | Safe retries; store key + response, replay on duplicate. |

## Domain-guarding at the database

Not a GoF pattern but the flagship senior signal: **double-booking is prevented by the database, not application locks** — a Postgres `EXCLUDE USING gist` constraint over `(tenant_id, staff_id, tstzrange(starts_at, ends_at))` rejects overlaps atomically. The app maps SQLSTATE `23P01` → `409 ConflictException`. See ADR `docs/adr/`.

## Deliberately NOT used

- **Full Hexagonal / ports-and-adapters everywhere** — over-engineering for CRUD modules; domain is extracted only for availability/state/value-objects. See architecture decision in `code-standards.md`.
- **CQRS / Event Sourcing** — YAGNI at this scale; outbox covers the async needs.
- **Generic base "God" service** — composition over a fat inheritance chain.

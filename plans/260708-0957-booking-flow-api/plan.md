# Plan: booking-flow-api — Multi-Tenant Booking SaaS API

Evolve the `express-typeorm` starter into **`booking-flow-api`**: a production-grade, multi-tenant booking SaaS backend (spa/clinic/gym/salon) built as a portfolio/CV project. Approved master plan: `~/.claude/plans/hello-precious-possum.md`.

## Locked decisions
- Keep Biome, winston, bcryptjs, envalid. Multi-tenancy = `tenant_id` + AsyncLocalStorage + base-repo auto-filter + **RLS**.
- Calendly-style domain. Senior extras: RLS, exclusion constraint (btree_gist), refresh rotation + reuse detection, audit log.
- SaaS logic: plan tiers + feature gating, cancellation/no-show + buffer, recurring (RRULE), outbound webhooks (HMAC+retry).
- Platform: OpenTelemetry, transactional outbox, availability cache, `/api/v1` + contract tests.
- Polish: Sentry, CI security scan + Dependabot, coverage gate + Codecov, ADRs + k6 + demo seed.
- Payments: Stripe (test) + SePay (sandbox). CI/CD: GHCR image + SemVer/release-please + tag strategy.

## Architecture references
- ADR-0001 tenancy isolation · ADR-0002 booking concurrency → `docs/adr/`.
- Reuse: `common/base`, `common/exceptions`, `common/interceptors`, `config/*`, `jobs/*`, `test/integration/support/*`.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 0 | Rename repo + API versioning | ✅ done | [phase-00](phase-00-rename-and-api-versioning.md) |
| 1 | Multi-tenancy core | ⬜ next | [phase-01](phase-01-multi-tenancy-core.md) |
| 2 | Onboarding, auth flows, invites | ⬜ | [phase-02](phase-02-onboarding-auth-invites.md) |
| 3 | Services & staff scheduling | ⬜ | [phase-03](phase-03-services-and-staff-scheduling.md) |
| 4 | Core booking engine ⭐ | ⬜ | [phase-04](phase-04-core-booking-engine.md) |
| 5 | Recurring + availability cache | ⬜ | [phase-05](phase-05-recurring-and-availability-cache.md) |
| 6 | Async: outbox, notifications, webhooks | ⬜ | [phase-06](phase-06-async-outbox-notifications-webhooks.md) |
| 7 | Plan tiers & feature gating | ⬜ | [phase-07](phase-07-plan-tiers-feature-gating.md) |
| 8 | Payments (Stripe + SePay) | ⬜ | [phase-08](phase-08-payments-stripe-sepay.md) |
| 9 | Observability, security, audit | ⬜ | [phase-09](phase-09-observability-security-audit.md) |
| 10 | Testing, CI/CD, delivery, docs | ⬜ | [phase-10](phase-10-testing-cicd-delivery-docs.md) |

## Dependencies
- 1 → 2 → 3 → 4 are strictly sequential (each builds on prior schema/context).
- 5, 6 depend on 4. 7 depends on 1. 8 depends on 7. 9 is cross-cutting (after 4). 10 is last.

## Cadence per phase
One feature branch per phase → implement → typecheck + lint + unit + integration green → conventional commit → code-review → next phase. Update `docs/` whenever a change has documentation impact.

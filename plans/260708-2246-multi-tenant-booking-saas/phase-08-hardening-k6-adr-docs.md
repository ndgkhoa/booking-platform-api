# Phase 08 — Hardening: k6 Load Test, ADRs, Docs, OpenAPI

## Context Links
- Overview: [plan.md](plan.md) · Depends: all prior phases
- Existing: swagger (`src/config/swagger.ts`), CI (`.github/workflows/ci.yml`), metrics (prom-client), testcontainers.

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** Prove the flagship guarantee under load (k6, 0 double-booking), write ADRs for the locked decisions, sync `docs/`, and polish OpenAPI. Cross-cutting quality gate.

## Key Insights
- k6 hits real running API against a seeded slot with high concurrency; success = DB row count for the slot is exactly 1 regardless of RPS. This is the empirical proof of the EXCLUDE guarantee (complements phase-03 integration test).
- ADRs are short (1 page): context, decision, consequences. One per locked decision so future devs understand *why*.
- OpenAPI: ensure `/api/v1` prefix, error schema `{success:false,error:{code,message,details}}`, Idempotency-Key header documented, auth/tenant header documented.

## Requirements
**Functional**
- k6 script + run instructions; asserts 0 double-booking; screenshot into README.
- ADRs committed under `docs/adr/`.
- `docs/` (system-architecture, codebase-summary, code-standards, project-overview) updated for multi-tenant reality.
- OpenAPI reflects all v1 endpoints + headers + error schema.

**Non-functional**
- CI runs integration + (optionally) a light k6 smoke. Load test documented for manual/heavier runs.

## Architecture
```
k6 script → POST /bookings (same slot, high VUs) → after run: SELECT count(*) slot = 1
Result screenshot → README "Concurrency Guarantee" section
ADRs → docs/adr/*.md
OpenAPI → swagger buildOpenApiSpec reflects v1
```

## Related Code Files
**Create**
- `load-tests/booking-double-booking.k6.js` — concurrent same-slot booking scenario + threshold checks.
- `load-tests/README.md` — how to run + interpret.
- `docs/adr/0001-exclude-over-locking.md` — why PG EXCLUDE vs app/row locking.
- `docs/adr/0002-postgres-rls.md` — why RLS defense-in-depth.
- `docs/adr/0003-tenant-model-customer-vs-membership.md` — customer table vs membership.
- `docs/adr/0004-transactional-outbox.md` — why outbox vs direct enqueue.
- `docs/adr/0005-timezone-utc-storage.md` — UTC storage + tenant-TZ compute + DST.
- `docs/adr/0006-money-integer-minor-units.md` — money as integer.
- (`docs/adr/0007-payment-provider.md` created in phase-07.)

**Modify**
- `src/config/swagger.ts` / controllers — annotate headers (Idempotency-Key, auth), error schema, v1.
- `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/code-standards.md`, `docs/project-overview-pdr.md` — multi-tenant/booking updates.
- `README.md` — add concurrency-guarantee section + k6 screenshot.
- `.github/workflows/ci.yml` — ensure new integration tests run; optional k6 smoke step.

**Delete** — none.

## Implementation Steps
1. Write k6 script: N VUs POST same staff+slot; threshold expects exactly 1 success, rest 409.
2. Run against seeded DB; capture output; `SELECT count(*)` for slot = 1; screenshot → README.
3. Write six ADRs (short) for locked decisions; phase-07 adds provider ADR.
4. Sync `docs/` to reflect tenant model, RLS, booking core, outbox.
5. Polish OpenAPI: v1 prefix, headers, error schema, tag grouping.
6. CI: confirm integration tests (incl. concurrency + RLS) run on fresh PG with btree_gist; add k6 smoke if fast enough.
7. Final review pass: file sizes <200 lines, no phase/finding refs in code/migration names.

## Todo
- [ ] k6 double-booking script + run docs
- [ ] Run k6, capture 0-double-booking proof + README screenshot
- [ ] ADR 0001-0006 (0007 in phase-07)
- [ ] Sync docs/ (architecture, summary, standards, pdr)
- [ ] OpenAPI polish (v1, headers, error schema)
- [ ] CI runs integration/RLS/concurrency tests on fresh PG
- [ ] Final lint: file sizes + naming compliance

## Success Criteria
- k6 at high concurrency → DB shows exactly 1 booking for contested slot; screenshot in README.
- All six (+provider) ADRs present and referenced from docs.
- OpenAPI validates and reflects all v1 endpoints + headers + error schema.
- CI green on fresh DB including btree_gist extension + RLS tests.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| k6 env flakiness | Med×Low | Deterministic seed; retry harness; document env |
| Docs drift again | Med×Med | Update as part of definition-of-done per phase |
| OpenAPI/reality mismatch | Med×Low | Generate from decorators; spot-check |
| CI lacks btree_gist on fresh image | Low×High | Migration creates extension; verify in CI PG image |

## Security Considerations
- Load-test env isolated from prod data.
- ADRs document RLS + super_admin threat model for auditors.

## Next Steps
- Ship-ready. Backlog: advanced series editing, materialized report rollups, subdomain tenant routing, more providers.

# Phase 05 — Reporting & Analytics

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-03](phase-03-availability-booking-core.md)
- Existing: `BaseQuery` pagination (`src/common/base/query.base.ts`), Money VO (phase-02).

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** Tenant-scoped reporting: bookings & revenue aggregated by time period, service, and staff. Read-only aggregation endpoints for owners.

## Key Insights
- Aggregations are read-heavy; keep in `*.repository.ts` (raw/QueryBuilder allowed in repo layer only). Group by period requires TZ-aware bucketing — bucket in tenant.timezone (`date_trunc(... , starts_at AT TIME ZONE tenant_tz)`).
- Revenue = SUM of booking price snapshots for `completed` (and optionally `confirmed`) — clarify which statuses count (open question).
- Money stays integer minor units through aggregation; format only at serialization.
- Start simple (on-the-fly SQL). Materialized views / rollup tables = YAGNI until load proves need (phase-08 can revisit).

## Requirements
**Functional**
- `GET /reports/bookings?from&to&groupBy=day|week|month|service|staff` → counts + status breakdown.
- `GET /reports/revenue?from&to&groupBy=...` → summed revenue (integer minor units) per bucket.
- Filter by staffId/serviceId; tenant-scoped.

**Non-functional**
- Queries index-supported (tenant_id, starts_at); bounded date range (reject unbounded/huge spans).

## Architecture
```
GET /reports/* → ReportingController → ReportingService → ReportingRepository (QueryBuilder aggregation, RLS-scoped)
   date bucketing in tenant.timezone; revenue = SUM(price_amount) filtered by counted statuses
```
- **Data flow:** bookings (phase-03) → aggregate SQL → typed report DTO → serialized (Money formatted at edge).

## Related Code Files
**Create**
- `src/modules/reporting/reporting.controller.ts` — endpoints + role guard (owner).
- `src/modules/reporting/reporting.service.ts` — validate range, choose bucket, map results.
- `src/modules/reporting/reporting.repository.ts` — aggregation QueryBuilder (tenant-scoped).
- `src/modules/reporting/dto/report-query.dto.ts` — extends `BaseQuery`; from/to/groupBy/filters with validation.
- `src/modules/reporting/dto/report-result.dto.ts` — typed buckets.
- Tests: aggregation correctness + TZ bucketing + range validation.

**Modify** — none.

**Delete** — none.

## Implementation Steps
1. Report query DTO: from/to (required, bounded), groupBy enum, optional staffId/serviceId.
2. Reporting repository: count query grouped by chosen dimension; TZ-aware `date_trunc` for time buckets.
3. Revenue query: SUM(price_amount) WHERE status IN (counted set), grouped.
4. Service maps rows → result DTO; enforce max range (e.g. 1 year).
5. Controller owner-guarded; RLS ensures tenant scope.
6. Tests: known dataset → expected buckets; DST week boundary; empty range.

## Todo
- [ ] Report query + result DTOs (bounded range validation)
- [ ] Bookings aggregation (by day/week/month/service/staff)
- [ ] Revenue aggregation (counted-status set, integer money)
- [ ] TZ-aware bucketing
- [ ] Owner RBAC + RLS scope
- [ ] Aggregation tests

## Success Criteria
- Reports match hand-computed expectations on seeded data.
- Time buckets align to tenant timezone, DST-correct.
- Cross-tenant data never appears (RLS).
- Unbounded/oversized ranges rejected (422).

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Slow full-table scans | Med×Med | Require bounded range; index (tenant_id,starts_at) |
| Wrong statuses in revenue | Med×Med | Explicit counted-status config; test |
| TZ bucket drift | Med×Med | date_trunc AT TIME ZONE tenant_tz; DST test |

## Security Considerations
- Owner/super_admin only; staff sees own subset if exposed (RBAC decision).
- No PII beyond tenant scope; RLS enforced.

## Next Steps
- Independent leaf. Dashboards/exports = future. Load-tested in phase-08 if needed.

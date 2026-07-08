# Phase 3 — Services & staff scheduling

## Context links
- Depends on Phase 1/2 (tenant context, roles). Reuse `common/base` + tenant-scoped repo. Feeds `AvailabilityService` in Phase 4.

## Overview
- **Priority:** high · **Status:** pending.
- Model the tenant's offerings and staff schedules that availability is computed from.

## Requirements
- Functional: CRUD services (name, price, duration, buffer); assign staff↔service; per-staff weekly working hours; per-staff time-off.
- Non-functional: working hours per (staff, weekday) non-overlapping; time-off valid range; money stored as integer minor units.

## Architecture / entities (all tenant-scoped)
- `Service` (name, `price` int minor units + currency, duration_min, buffer_min).
- `StaffService` (staff_id, service_id) — M2M join.
- `WorkingHours` (staff_id, day_of_week 0–6, start_time `time`, end_time `time`).
- `TimeOff` (staff_id, `tstzrange` or start/end timestamptz, reason).
- Value objects `common/value-objects/{time-range.ts,money.ts}` — validation encapsulated.

## Related code files
- **Create:** `modules/service/*`, `modules/scheduling/{working-hours,time-off}.*`, `common/value-objects/*`, migrations.
- **Modify:** none major (new modules auto-discovered).

## Implementation steps
1. Value objects (TimeRange overlap logic, Money).
2. Service entity + CRUD (owner-only writes, tenant read).
3. StaffService assignment endpoints.
4. WorkingHours CRUD + non-overlap validation per (staff, weekday).
5. TimeOff CRUD + range validation.

## Todo
- [ ] TimeRange + Money VOs (+ unit tests)
- [ ] Service CRUD
- [ ] StaffService assignment
- [ ] WorkingHours CRUD + overlap guard
- [ ] TimeOff CRUD
- [ ] Unit tests for scheduling validation

## Success criteria
- Owner configures services, assigns staff, sets weekly hours + time-off; overlap/invalid inputs rejected (422); unit tests for VO + validation green.

## Risks
- `time` columns are tz-naive; interpret against the tenant timezone in Phase 4 availability math (document clearly).

## Next
- Phase 4 consumes services + working hours + time-off to compute availability and create bookings.

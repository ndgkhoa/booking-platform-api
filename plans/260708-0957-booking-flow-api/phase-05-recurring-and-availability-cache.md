# Phase 5 — Recurring bookings + availability caching

## Context links
- Depends on Phase 4 (booking create + availability). Reuse `config/redis.ts`, `common/utils/cache.ts`.

## Overview
- **Priority:** medium · **Status:** pending.
- Add repeat bookings (iCal RRULE) and cache availability reads with correct invalidation.

## Requirements
- Functional: create a recurring series (e.g. weekly), conflict-check each occurrence, create the ones that fit (report skipped conflicts). Cancel one / whole series.
- Non-functional: availability reads served from Redis cache; cache invalidated on any booking write or schedule change.

## Architecture
- `rrule` lib to expand occurrences within a horizon; each occurrence goes through Phase 4 `create()` (reuses all concurrency guards).
- `booking_series` table (rrule string, service/staff, anchor) linking generated bookings.
- Cache key `avail:{tenant}:{staff}:{date}`; invalidate on booking create/cancel/reschedule and working-hours/time-off change (publish invalidation in the same tenant transaction path).

## Todo
- [ ] `rrule` integration + series expansion
- [ ] `booking_series` entity + endpoints (create/cancel series)
- [ ] Per-occurrence conflict handling (skip + report)
- [ ] Redis availability cache + invalidation hooks
- [ ] Tests: weekly series; cache hit + invalidation on write

## Success criteria
- Recurring weekly booking creates N non-conflicting occurrences, skips conflicts with a clear report; availability cached and invalidated correctly (integration test).

## Risks
- Unbounded RRULE → cap horizon (e.g. 12 weeks / max count). Stale cache → invalidate inside the write transaction, not after.

## Next
- Phase 6 emits events for each booking/occurrence change.

# Phase 06 — Recurring Bookings

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-03](phase-03-availability-booking-core.md)

## Overview
- **Priority:** P2
- **Status:** ✅ Done
- **Description:** Repeating appointments (e.g. weekly). A recurrence definition expands into individual `Booking` rows, each still guarded by the EXCLUDE constraint and state machine. Partial-conflict handling defined.

## Key Insights
- **Do NOT bypass the EXCLUDE constraint for recurring.** Each occurrence is a normal Booking row → same race-proof guarantee. Recurrence is just a generator + linkage.
- Expansion is TZ/DST-aware (weekly at local 10:00 must stay 10:00 local across DST) → reuse phase-03 luxon logic.
- Conflict policy: when generating a series, some occurrences may collide. Policy = `skip_conflicts` (create non-conflicting, report skipped) vs `all_or_nothing` (tx rollback if any conflict). Default `skip_conflicts` (KISS, most useful); expose choice.
- Bounded expansion: cap horizon (e.g. max 52 occurrences or 1 year) — no infinite series materialization (YAGNI on open-ended).
- Editing series: "this occurrence" vs "this and future" — start minimal: cancel single occurrence, or cancel whole series. Full iCal-style editing = future.

## Requirements
**Functional**
- Create recurring booking: service, staff, customer, start, RRULE-ish (frequency=weekly/daily, interval, count|until, weekdays).
- Expand into individual bookings within horizon; each EXCLUDE-checked.
- Report which occurrences created vs skipped (conflict policy).
- Cancel single occurrence or entire series.

**Non-functional**
- Expansion bounded; batch insert in one tenant tx (per policy).

## Architecture
```
POST /bookings/recurring → RecurrenceService.expand(rule, horizon)
   → candidate occurrences (local→UTC, DST-safe)
   → per occurrence: attempt Booking insert (EXCLUDE-guarded)
        skip_conflicts: catch 23P01 → record skipped, continue
        all_or_nothing: any 23P01 → rollback all, 409
   → link occurrences via recurrence_id
   → outbox events per created occurrence (phase-04)
```
- **Data flow:** rule → generator → N booking inserts (constraint-guarded) → series linkage → per-occurrence events.

## Related Code Files
**Create**
- `src/modules/recurrence/recurrence.entity.ts` (`recurrences`) — tenant_id, service_id, staff_id, customer_id, freq, interval, weekdays, count/until, timezone snapshot.
- `src/modules/recurrence/recurrence.service.ts` — expand + orchestrate inserts per policy.
- `src/modules/recurrence/recurrence-expander.ts` — pure rule→dates generator (DST-safe, bounded); unit-tested standalone (<200 lines).
- `src/modules/recurrence/recurrence.controller.ts` + DTOs (`create-recurrence.dto.ts`).
- `src/database/migrations/{ts}-recurrences.ts` — recurrences table + `recurrence_id` FK on bookings (nullable) + RLS.
- Tests: expander (DST, count/until, weekday), conflict-policy behavior.

**Modify**
- `src/modules/booking/booking.entity.ts` — add nullable `recurrence_id`.
- `src/modules/booking/booking.service.ts` — reuse single-insert path for occurrences.

**Delete** — none.

## Implementation Steps
1. Recurrence entity + migration; add nullable `recurrence_id` to bookings.
2. Pure expander: freq/interval/weekdays/count/until → local dates → UTC (luxon), horizon-capped.
3. RecurrenceService: iterate occurrences, insert via booking path, apply conflict policy.
4. Controller endpoint + DTO validation (cap count/horizon).
5. Cancel-series + cancel-occurrence endpoints (series cancel = cancel all future pending/confirmed via state machine).
6. Emit outbox events per created occurrence.
7. Tests: expander correctness incl. DST; skip_conflicts vs all_or_nothing; series cancel.

## Todo
- [x] Recurrence entity + migration (+ nullable bookings.recurrence_id FK ON DELETE SET NULL, +RLS, reversible)
- [x] Pure `recurrence-expander` (daily/weekly, interval, weekdays, count|until) — DST-safe via luxon calendar math, hard-capped at MAX_OCCURRENCES(100); 6 unit tests incl. DST-constant weekly
- [x] RecurrenceService conflict policy: **skip_conflicts uses per-occurrence SAVEPOINT** so a 23P01 rolls back to the savepoint and is skipped without poisoning the request tx; **all_or_nothing** lets the 409 roll back the whole series
- [x] `POST /recurrences` (DTO caps: interval ≤52, count ≤100, weekdays 0-6) → { recurrenceId, created[], skipped[] }
- [x] `POST /recurrences/:id/cancel` — bulk-cancels future active occurrences
- [x] Per-occurrence outbox `booking.created` events (via BookingService.createOccurrence → EXCLUDE + emit)
- [x] e2e: weekly expand, skip_conflicts skips the clash, all_or_nothing 409+rollback, series cancel — 35 unit + 67 integration green

**Key correctness win:** each occurrence is a normal EXCLUDE-guarded Booking (no constraint bypass); the SAVEPOINT pattern is what lets skip_conflicts catch-and-continue inside the single per-request transaction.

**Deferred:** "this & future" per-occurrence editing; recurrence list/get endpoints (YAGNI).

**Phase 06 COMPLETE.**

## Success Criteria
- Weekly series across DST keeps local time constant.
- skip_conflicts creates available occurrences, reports skipped; all_or_nothing rolls back on any conflict.
- Each occurrence individually EXCLUDE-protected (concurrency-safe).
- Series cancel cancels future occurrences only (respects state machine).

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Unbounded expansion | Med×High | Hard cap count/horizon; validate DTO |
| Partial-failure ambiguity | Med×Med | Explicit policy + clear response of created/skipped |
| DST drift in series | Med×High | luxon local-anchored generation + tests |
| Large tx lock contention | Low×Med | Batch size cap; per-occurrence insert |

## Security Considerations
- Same RBAC/RLS as single bookings; customer limited to own; owner/staff tenant-scoped.

## Next Steps
- Leaf. Advanced series editing ("this & future") = future backlog.

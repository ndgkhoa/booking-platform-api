# Code Review — Phase-03 Slice B: AvailabilityService (bookable-slot computation, DST-safe tz math)

- Branch: `develop` | Range: `16f9b6d..ebc9f03` | Reviewer: code-reviewer | 2026-07-09
- Scope: `src/modules/availability/*`, supporting reads in booking/staff-service/staff/working-hours, tests.
- Verified green upstream (typecheck/lint/unit 21, integration 46, migration). Read-only review; no code modified.

## Overall Assessment

Structure is clean, tenant-scoping and soft-delete leakage are correctly handled, half-open interval math is right, and the aggregation design is sensible. **However the headline claim of the slice — "DST-safe timezone math" — is provably false on the two DST-transition days per year.** `localMinutesToUtc` adds *absolute* elapsed minutes across `startOf('day')`, so wall-clock working hours are shifted by ±1h on transition days. The unit + integration tests are green only because none of them exercise an actual transition day. This is the primary blocker.

---

## CRITICAL

None that cause data loss or cross-tenant leak. (The DST defect below is a correctness bug in the advertised feature; escalate to Critical if "DST-safe" is a hard acceptance criterion for sign-off.)

---

## HIGH

### H1 — `localMinutesToUtc` shifts wall-clock hours by ±1h on DST-transition days
`src/modules/availability/local-time.ts:9-11`

`DateTime.fromISO(date,{zone}).startOf('day').plus({minutes}).toUTC()` adds **absolute** minutes. `plus({minutes})` is a time-duration add, not a calendar/wall-clock set. On a transition day, midnight→+540min crosses the DST gap/overlap and lands on the wrong wall clock. Empirically verified (America/New_York, luxon 3.7):

| Day | Configured start | Correct UTC (wall 09:00) | Actual output | Wall-clock landed |
|-----|------------------|--------------------------|---------------|-------------------|
| 2026-03-08 spring-forward (23h) | 09:00 | `13:00Z` | `14:00Z` | **10:00** (+1h) |
| 2026-11-01 fall-back (25h) | 09:00 | `14:00Z` | `13:00Z` | **08:00** (−1h) |
| 2026-06-01 normal | 09:00 | `13:00Z` | `13:00Z` | 09:00 ✓ |

Impact: on both DST days per year, every working-hours window and every generated slot for a DST-observing tenant is offset by one hour from what staff configured — offering slots outside real working hours and hiding valid ones. The docstring at `local-time.ts:3-8` explicitly (and incorrectly) claims correctness here. The `dayEnd = localMinutesToUtc(date,1440)` bound (`availability.service.ts:53`) has the same root cause: on 2026-03-08 it returns `2026-03-09T05:00Z` but true next-local-midnight is `04:00Z` (overshoot 1h); on 2026-11-01 it returns `04:00Z` vs true `05:00Z` (undershoot 1h → a booking in the final local hour is missed by `findActiveForStaffBetween`, though self-consistently no slot is generated there either).

Fix — construct the local wall-clock time directly and use calendar add for the day boundary:
```ts
export function localMinutesToUtc(date: string, minutes: number, zone: string): Date {
  const day = Math.floor(minutes / 1440);
  const rem = minutes % 1440;
  return DateTime.fromISO(date, { zone })
    .startOf('day')
    .plus({ days: day })                                   // 1440 → next local midnight (DST-correct)
    .set({ hour: Math.floor(rem / 60), minute: rem % 60 }) // wall-clock set, DST-correct
    .toUTC()
    .toJSDate();
}
```
Verified luxon `.set({hour,minute})` handles the two edge times sanely: non-existent 02:30 (spring) → advances to 03:30 EDT; ambiguous 01:30 (fall) → picks the earlier (−04:00) occurrence. Both acceptable defaults. Note the current buggy approach's only "advantage" is dodging non-existent-time handling — a bad trade, since working hours are almost never at 02:00 but daytime hours are always affected.

### H2 — Tests do not cover any DST-transition day (masking H1)
`test/unit/availability.spec.ts:7-13`, `test/integration/availability.e2e.spec.ts:106-114`

Unit test uses 2026-01-15 / 2026-07-15; integration "DST offset applied" test uses 2026-07-06 — all **stable-offset** days. The suite is green while the transition-day bug is live. Add cases for 2026-03-08 (spring) and 2026-11-01 (fall) asserting a 09:00 window → `13:00Z` / `14:00Z` respectively. This is the regression guard for H1 and should land with the fix.

---

## MEDIUM

### M1 — Buffer is doubled and sourced from the wrong service
`src/modules/availability/availability.service.ts:46, 103-106`

`bufferMs = (bufferBeforeMin + bufferAfterMin) * MINUTE_MS`, then each existing booking is expanded by `start - bufferMs` **and** `end + bufferMs`. Two issues:
1. **Sums before+after and applies the total on both sides.** With before=15/after=15 a booking is padded 30min on each side (60min total) instead of the intended 15-before/15-after (30min total). Over-blocks — hides valid slots.
2. **Uses the queried service's buffers against pre-existing bookings** that belong to (possibly different) services with their own buffer config. Buffer semantically belongs to the existing booking's service.

Since the EXCLUDE constraint carries no buffer, availability is already stricter than the DB (acceptable UX direction — never offers a buffer-violating slot). But the doubling is a genuine logic error. Fix: apply `bufferBeforeMin` to the leading edge and `bufferAfterMin` to the trailing edge, and decide explicitly whose buffer applies (recommend the existing booking's service; if kept as queried-service for simplicity, document it). Flagging honestly per request.

### M2 — Unbounded time-off load; N+1 across capable staff
`src/modules/availability/availability.service.ts:70, 97-100`; `time-off.service.ts:25`

`timeOff.list(staffId)` (`TimeOffRepository.listForStaff`) loads **all** time-off rows ever for the staff, then filters to the day in JS (`availability.service.ts:97-99`). Grows unbounded per busy tenant. Also, per staff the loop issues 4 queries (`findById` + `forStaffWeekday` + `timeOff.list` + `activeForStaffBetween`); for a service with many capable staff this is 4N. Fix: add a date-bounded repo query mirroring `findActiveForStaffBetween` (`startsAt < dayEnd AND endsAt > dayStart`) for time-off; optionally batch per-staff reads by `staffId IN (...)`. The unbounded time-off query is the sharper concern.

### M3 — Invalid tenant timezone / invalid calendar date silently yield empty results
`availability.service.ts:43,52-53,72-74`; `dto/availability-query.dto.ts:12`; `tenant.service.ts` (CreateTenantInput.timezone unvalidated)

`DateTime.fromISO(date,{zone:'Bad/Zone'})` → invalid → `.toJSDate()` = Invalid Date → `getTime()` = NaN → `generateSlots` loop condition is `false` → returns `[]`. No error, just silently-empty availability. Tenant `timezone` is accepted at onboarding without `@IsTimeZone` validation (defaults to `'UTC'`, but any string can be set). Likewise the `date` regex `^\d{4}-\d{2}-\d{2}$` accepts impossible dates (e.g. `2026-13-45`, `2026-02-30`) → luxon invalid → silent empty. Fix: validate `timezone` with `@IsTimeZone()` at tenant create; either guard for `!dt.isValid` in `localMinutesToUtc`/`weekdayInZone` and throw a 400/500, or use `@IsISO8601({ strict: true })` (or a luxon `.isValid` check) for the date param so bad input 400s instead of returning a misleading empty set.

---

## LOW

- **L1 — Non-deterministic ordering for same-time slots across staff.** `availability.service.ts:86` sorts by `startsAt` only; ties (different staff, same instant) fall in arbitrary order. Add `staffId` as secondary sort key for stable output.
- **L2 — Docstring overclaims.** `local-time.ts:3-8` asserts DST correctness that H1 disproves. Update when H1 is fixed.
- **L3 — Back-to-back-only granularity.** `slot-generator.ts:22` steps by `durationMs`, so no configurable slot interval (e.g. 15-min grid). Fine per scope/YAGNI — noting as a known design limit for future slicing.

---

## Positive Observations

- **Soft-deleted staff cannot leak slots** (verified): `capableStaffIds` join table has no active filter, but `staff.findById` → `findOne` on `@DeleteDateColumn` entity auto-adds `deleted_at IS NULL`, and `!staff?.active` (`availability.service.ts:61`) catches inactive. Correct defense.
- **Tenant scoping is sound** — all reads route through tenant-scoped services/`BaseTenantRepository`; `getTenantId()` is context-sourced, never caller-supplied. No cross-tenant exposure in the endpoint.
- **Half-open overlap is correct** (`slot-generator.ts:7`): a blocker with `end == slot.start` is not dropped; window-exceeding and zero/negative windows return `[]`.
- ISO-string `localeCompare` sort is chronologically correct for uniform `Z` timestamps. No `any`, clean DI, files well under size limits.

---

## Blockers before Slice C (idempotency/ETag)

1. **H1** — fix `localMinutesToUtc` (and `dayEnd`) DST math. Blocks any correctness sign-off of the "DST-safe" claim.
2. **H2** — add spring/fall transition-day tests as the H1 regression guard.

M1–M3 are strongly recommended but not hard blockers for Slice C.

## Unresolved Questions

1. Buffer model (M1): should the buffer be the existing booking's service buffers (recommended) or the queried service's? And is asymmetric before/after intended? Needs product decision.
2. Is DST-transition-day correctness a hard acceptance criterion (→ H1 becomes Critical) or best-effort?
3. Invalid `date`/`timezone` (M3): desired behavior — 400 error vs. empty result? Empty currently masks misconfiguration.

## Status

**Status:** DONE_WITH_CONCERNS
**Summary:** Slice B is well-structured and tenant-safe, but `localMinutesToUtc` is not DST-safe — it shifts wall-clock hours by ±1h on the two transition days/year (H1), uncovered by tests (H2). Plus buffer doubling (M1), unbounded time-off load / N+1 (M2), and silent-empty on invalid tz/date (M3).
**Concerns/Blockers:** H1 + H2 block sign-off of the DST claim and should be fixed before Slice C.

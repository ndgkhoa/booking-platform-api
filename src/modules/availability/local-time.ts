import { DateTime } from 'luxon';

/**
 * The UTC instant for a local wall-clock minute-of-day on a calendar date in an
 * IANA zone. DST-safe: `.set({hour,minute})` picks the wall-clock time and luxon
 * resolves the offset for THAT local date, so `09:00` maps to the right instant
 * even on transition days. (Do NOT use `.plus({minutes})` from midnight — that
 * adds *absolute* minutes and lands an hour off across a DST boundary.)
 *
 * `minutes === 1440` yields the next local midnight; non-existent (spring-forward
 * gap) and ambiguous (fall-back repeat) wall times are resolved sanely by luxon.
 */
export function localMinutesToUtc(date: string, minutes: number, zone: string): Date {
  return DateTime.fromISO(date, { zone })
    .startOf('day')
    .set({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toUTC()
    .toJSDate();
}

/** WorkingHours weekday (0=Sun..6=Sat) for a calendar date in a zone. */
export function weekdayInZone(date: string, zone: string): number {
  // luxon weekday is 1=Mon..7=Sun; map Sun(7)→0, Mon..Sat(1..6) unchanged.
  return DateTime.fromISO(date, { zone }).weekday % 7;
}

/** True when `date` (YYYY-MM-DD) is a real calendar date — catches e.g. 2026-13-45. */
export function isValidLocalDate(date: string): boolean {
  return DateTime.fromISO(date).isValid;
}

import { DateTime } from 'luxon';

/** DST-safe: sets the wall-clock hour/minute directly rather than adding absolute minutes from midnight, which would drift across a DST boundary. */
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

import { DateTime } from 'luxon';

/**
 * The UTC instant for a local wall-clock minute-of-day on a calendar date in an
 * IANA zone. DST-safe: the zone's offset for THAT date is applied by luxon, so a
 * `09:00` slot lands on the correct absolute instant even on transition days —
 * never add fixed offsets.
 */
export function localMinutesToUtc(date: string, minutes: number, zone: string): Date {
  return DateTime.fromISO(date, { zone }).startOf('day').plus({ minutes }).toUTC().toJSDate();
}

/** WorkingHours weekday (0=Sun..6=Sat) for a calendar date in a zone. */
export function weekdayInZone(date: string, zone: string): number {
  // luxon weekday is 1=Mon..7=Sun; map Sun(7)→0, Mon..Sat(1..6) unchanged.
  return DateTime.fromISO(date, { zone }).weekday % 7;
}

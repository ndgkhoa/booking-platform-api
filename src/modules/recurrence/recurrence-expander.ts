import { DateTime } from 'luxon';

export type RecurrenceFreq = 'daily' | 'weekly';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number; // every N days/weeks (≥ 1)
  weekdays?: number[]; // 0=Sun..6=Sat, weekly only; defaults to the start weekday
  startDate: string; // YYYY-MM-DD, first candidate day (tenant-local)
  startMinutes: number; // minutes from local midnight
  count?: number; // number of occurrences
  until?: string; // YYYY-MM-DD inclusive (tenant-local)
  timezone: string; // IANA zone
}

/** Safety bound so an open-ended rule can never scan/emit without limit. */
export const MAX_OCCURRENCES = 100;

/**
 * Expands a recurrence rule into individual UTC start instants. Times are
 * anchored to the local wall clock (luxon calendar math keeps e.g. weekly 10:00
 * at 10:00 local across a DST change) then converted to UTC. Always bounded by
 * `count`, `until`, and `MAX_OCCURRENCES`.
 */
export function expandRecurrence(rule: RecurrenceRule): Date[] {
  const zone = rule.timezone;
  const hour = Math.floor(rule.startMinutes / 60);
  const minute = rule.startMinutes % 60;
  const start = DateTime.fromISO(rule.startDate, { zone }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
  if (!start.isValid) return [];

  const limit = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until ? DateTime.fromISO(rule.until, { zone }).endOf('day') : null;

  return rule.freq === 'daily'
    ? expandDaily(start, rule.interval, limit, until)
    : expandWeekly(start, rule, limit, until);
}

function expandDaily(
  start: DateTime,
  interval: number,
  limit: number,
  until: DateTime | null,
): Date[] {
  const out: Date[] = [];
  for (let cur = start; out.length < limit; cur = cur.plus({ days: interval })) {
    if (until && cur > until) break;
    out.push(cur.toUTC().toJSDate());
  }
  return out;
}

function expandWeekly(
  start: DateTime,
  rule: RecurrenceRule,
  limit: number,
  until: DateTime | null,
): Date[] {
  // luxon weekday: 1=Mon..7=Sun → map to 0=Sun..6=Sat to match WorkingHours.
  const toSun0 = (dt: DateTime) => dt.weekday % 7;
  const weekdays = new Set(rule.weekdays?.length ? rule.weekdays : [toSun0(start)]);
  const anchorWeek = start.startOf('week'); // Monday of the start week

  // Enough days to reach `limit` emitted occurrences given the interval and how
  // many weekdays fire per active week — never a fixed silent cap.
  const perActiveWeek = Math.max(weekdays.size, 1);
  const maxScanDays = Math.ceil(limit / perActiveWeek) * rule.interval * 7 + 7;

  const out: Date[] = [];
  let cursor = start;
  for (let scanned = 0; out.length < limit && scanned < maxScanDays; scanned++) {
    if (until && cursor > until) break;
    const weekIndex = Math.floor(cursor.startOf('week').diff(anchorWeek, 'weeks').weeks);
    if (weekIndex % rule.interval === 0 && weekdays.has(toSun0(cursor))) {
      out.push(cursor.toUTC().toJSDate());
    }
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

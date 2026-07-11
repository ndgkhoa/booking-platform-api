import { expandRecurrence, MAX_OCCURRENCES } from '@modules/recurrence/recurrence-expander';

const iso = (d: Date) => d.toISOString();

describe('recurrence expander', () => {
  it('expands a daily rule by count', () => {
    const out = expandRecurrence({
      freq: 'daily',
      interval: 1,
      startDate: '2026-06-01',
      startMinutes: 540, // 09:00
      count: 3,
      timezone: 'UTC',
    });
    expect(out.map(iso)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-02T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
    ]);
  });

  it('honours interval and `until` (inclusive)', () => {
    const out = expandRecurrence({
      freq: 'daily',
      interval: 2,
      startDate: '2026-06-01',
      startMinutes: 0,
      until: '2026-06-05',
      timezone: 'UTC',
    });
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-06-01',
      '2026-06-03',
      '2026-06-05',
    ]);
  });

  it('expands weekly on specific weekdays', () => {
    // Mon (1) and Wed (3), 2 weeks, starting Mon 2026-06-01.
    const out = expandRecurrence({
      freq: 'weekly',
      interval: 1,
      weekdays: [1, 3],
      startDate: '2026-06-01',
      startMinutes: 600,
      count: 4,
      timezone: 'UTC',
    });
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-06-01', // Mon
      '2026-06-03', // Wed
      '2026-06-08', // Mon
      '2026-06-10', // Wed
    ]);
  });

  it('skips off-interval weeks (every 2 weeks)', () => {
    const out = expandRecurrence({
      freq: 'weekly',
      interval: 2,
      weekdays: [1], // Monday
      startDate: '2026-06-01',
      startMinutes: 540,
      count: 3,
      timezone: 'UTC',
    });
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-06-01',
      '2026-06-15',
      '2026-06-29',
    ]);
  });

  it('keeps local wall-clock time constant across a DST change (weekly 10:00)', () => {
    // America/New_York springs forward 2026-03-08. Weekly Sunday 10:00 local:
    // 2026-03-01 EST (UTC-5) → 15:00Z; 2026-03-08 EDT (UTC-4) → 14:00Z.
    const out = expandRecurrence({
      freq: 'weekly',
      interval: 1,
      weekdays: [0], // Sunday
      startDate: '2026-03-01',
      startMinutes: 600, // 10:00
      count: 2,
      timezone: 'America/New_York',
    });
    expect(out.map(iso)).toEqual(['2026-03-01T15:00:00.000Z', '2026-03-08T14:00:00.000Z']);
  });

  it('reaches the full count for a sparse weekly rule (no silent truncation)', () => {
    // Every 3 weeks, one weekday, 20 occurrences → ~60 weeks; must not stop short.
    const out = expandRecurrence({
      freq: 'weekly',
      interval: 3,
      weekdays: [1],
      startDate: '2026-01-05', // Monday
      startMinutes: 540,
      count: 20,
      timezone: 'UTC',
    });
    expect(out).toHaveLength(20);
  });

  it('is bounded by MAX_OCCURRENCES for an open-ended count', () => {
    const out = expandRecurrence({
      freq: 'daily',
      interval: 1,
      startDate: '2026-01-01',
      startMinutes: 0,
      count: 10_000,
      timezone: 'UTC',
    });
    expect(out).toHaveLength(MAX_OCCURRENCES);
  });
});

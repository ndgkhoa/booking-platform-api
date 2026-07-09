import { localMinutesToUtc, weekdayInZone } from '@modules/availability/local-time';
import { generateSlots } from '@modules/availability/slot-generator';

describe('local-time (DST-safe conversion)', () => {
  it('applies the zone offset for the specific date', () => {
    // America/New_York: EST (UTC-5) in winter, EDT (UTC-4) in summer.
    expect(localMinutesToUtc('2026-01-15', 540, 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(localMinutesToUtc('2026-07-15', 540, 'America/New_York').toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('keeps wall-clock time correct across DST transition days', () => {
    // 09:00 local must map to the offset of the target date, not drift ±1h.
    // Spring-forward (2026-03-08): after the jump New York is EDT (UTC-4).
    expect(localMinutesToUtc('2026-03-08', 540, 'America/New_York').toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
    // Fall-back (2026-11-01): after the fall New York is EST (UTC-5).
    expect(localMinutesToUtc('2026-11-01', 540, 'America/New_York').toISOString()).toBe(
      '2026-11-01T14:00:00.000Z',
    );
  });

  it('maps minute 1440 to the next local midnight (DST-aware day end)', () => {
    // End of the spring-forward day → next local midnight is 04:00Z (EDT).
    expect(localMinutesToUtc('2026-03-08', 1440, 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('maps weekday to 0=Sun..6=Sat', () => {
    expect(weekdayInZone('2026-01-04', 'UTC')).toBe(0); // Sunday
    expect(weekdayInZone('2026-01-05', 'UTC')).toBe(1); // Monday
    expect(weekdayInZone('2026-01-10', 'UTC')).toBe(6); // Saturday
  });
});

describe('slot-generator', () => {
  const H = 3_600_000;

  it('slices a window into consecutive slots', () => {
    const slots = generateSlots({ start: 0, end: 4 * H }, H, []);
    expect(slots).toHaveLength(4);
  });

  it('drops slots overlapping a blocker but keeps the rest', () => {
    const slots = generateSlots({ start: 0, end: 4 * H }, H, [{ start: H, end: 2 * H }]);
    expect(slots).toEqual([
      { start: 0, end: H },
      { start: 2 * H, end: 3 * H },
      { start: 3 * H, end: 4 * H },
    ]);
  });

  it('does not emit a slot that would exceed the window', () => {
    const slots = generateSlots({ start: 0, end: 90 * 60_000 }, H, []);
    expect(slots).toHaveLength(1); // only [0,60m]; [60m,120m] exceeds 90m
  });
});

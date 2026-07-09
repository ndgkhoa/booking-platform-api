import { Money } from '@common/value-objects/money';
import { TimeRange } from '@common/value-objects/time-range';

describe('Money', () => {
  it('rejects non-integer and negative amounts', () => {
    expect(() => Money.of(1.5)).toThrow();
    expect(() => Money.of(-1)).toThrow();
  });

  it('adds same-currency and rejects cross-currency', () => {
    expect(Money.of(100).add(Money.of(50)).amount).toBe(150);
    expect(() => Money.of(100, 'VND').add(Money.of(1, 'USD'))).toThrow();
  });

  it('multiplies by a non-negative integer', () => {
    expect(Money.of(200).multiply(3).amount).toBe(600);
    expect(() => Money.of(200).multiply(1.5)).toThrow();
  });

  it('compares by value', () => {
    expect(Money.of(100, 'vnd').equals(Money.of(100, 'VND'))).toBe(true);
    expect(Money.of(100).equals(Money.of(101))).toBe(false);
  });
});

describe('TimeRange', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));

  it('requires end after start', () => {
    expect(() => TimeRange.of(at(10), at(10))).toThrow();
    expect(() => TimeRange.of(at(11), at(10))).toThrow();
  });

  it('computes duration in minutes', () => {
    expect(TimeRange.of(at(9), at(10)).durationMinutes).toBe(60);
  });

  it('detects overlaps (half-open — touching ends do not overlap)', () => {
    const a = TimeRange.of(at(9), at(11));
    expect(a.overlaps(TimeRange.of(at(10), at(12)))).toBe(true);
    expect(a.overlaps(TimeRange.of(at(11), at(12)))).toBe(false);
    expect(a.overlaps(TimeRange.of(at(7), at(9)))).toBe(false);
  });

  it('detects containment', () => {
    const a = TimeRange.of(at(9), at(12));
    expect(a.contains(TimeRange.of(at(10), at(11)))).toBe(true);
    expect(a.contains(TimeRange.of(at(8), at(11)))).toBe(false);
  });
});

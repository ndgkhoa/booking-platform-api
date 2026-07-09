/**
 * A half-open time interval [start, end) in absolute (UTC) time. Immutable and
 * always valid (end strictly after start). Central to availability and
 * conflict detection in later phases.
 */
export class TimeRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static of(start: Date, end: Date): TimeRange {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('TimeRange bounds must be valid dates');
    }
    if (end.getTime() <= start.getTime()) {
      throw new Error('TimeRange end must be after start');
    }
    return new TimeRange(start, end);
  }

  get durationMinutes(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / 60_000);
  }

  /** True when the two ranges share any instant (half-open, so touching ends do not). */
  overlaps(other: TimeRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  contains(other: TimeRange): boolean {
    return this.start <= other.start && other.end <= this.end;
  }
}

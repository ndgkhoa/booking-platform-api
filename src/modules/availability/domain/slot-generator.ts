/** A half-open interval in epoch milliseconds. */
export interface MsInterval {
  start: number;
  end: number;
}

function overlaps(a: MsInterval, b: MsInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Slices a free window into consecutive durationMs slots, dropping any that overlap a blocker (time-off / buffer-expanded bookings, in UTC ms). */
export function generateSlots(
  window: MsInterval,
  durationMs: number,
  blockers: MsInterval[],
): MsInterval[] {
  const slots: MsInterval[] = [];
  for (let start = window.start; start + durationMs <= window.end; start += durationMs) {
    const slot: MsInterval = { start, end: start + durationMs };
    if (!blockers.some((blocker) => overlaps(slot, blocker))) {
      slots.push(slot);
    }
  }
  return slots;
}

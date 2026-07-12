import { UnprocessableStateException } from '@common/exceptions';
import { BookingStatus } from '@common/types/enums/booking-status';

/**
 * Explicit booking lifecycle. All allowed status changes live here so transition
 * rules are one source of truth, not scattered `if`s across the service.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  [BookingStatus.Pending]: [BookingStatus.Confirmed, BookingStatus.Cancelled, BookingStatus.NoShow],
  [BookingStatus.Confirmed]: [
    BookingStatus.Completed,
    BookingStatus.Cancelled,
    BookingStatus.NoShow,
  ],
  [BookingStatus.Completed]: [],
  [BookingStatus.Cancelled]: [],
  [BookingStatus.NoShow]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertCanTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new UnprocessableStateException(`Cannot change a ${from} booking to ${to}`);
  }
}

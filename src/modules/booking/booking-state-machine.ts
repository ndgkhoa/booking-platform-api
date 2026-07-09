import { UnprocessableStateException } from '@common/exceptions';
import type { BookingStatus } from '@modules/booking/booking-status';

/**
 * Explicit booking lifecycle. All allowed status changes live here so transition
 * rules are one source of truth, not scattered `if`s across the service.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertCanTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new UnprocessableStateException(`Cannot change a ${from} booking to ${to}`);
  }
}

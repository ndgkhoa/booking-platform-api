/** Booking lifecycle states. Enum-style const so code reads `BookingStatus.Confirmed`. */
export const BookingStatus = {
  Pending: 'pending',
  Confirmed: 'confirmed',
  Completed: 'completed',
  Cancelled: 'cancelled',
  NoShow: 'no_show',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Statuses that occupy a slot — the EXCLUDE constraint only guards these. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.Pending,
  BookingStatus.Confirmed,
];

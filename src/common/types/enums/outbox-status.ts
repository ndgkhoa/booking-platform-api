/** Lifecycle of an outbox event as it moves from written to delivered. */
export const OutboxStatus = {
  Pending: 'pending',
  Dispatched: 'dispatched',
  Dead: 'dead',
} as const;

export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

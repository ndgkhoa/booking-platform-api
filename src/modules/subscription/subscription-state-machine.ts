import { SubscriptionStatus } from '@common/types/enums/subscription-status';

/** Explicit subscription lifecycle mirroring provider states. */
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  [SubscriptionStatus.Trialing]: [
    SubscriptionStatus.Active,
    SubscriptionStatus.PastDue,
    SubscriptionStatus.Canceled,
  ],
  [SubscriptionStatus.Active]: [SubscriptionStatus.PastDue, SubscriptionStatus.Canceled],
  [SubscriptionStatus.PastDue]: [SubscriptionStatus.Active, SubscriptionStatus.Canceled],
  [SubscriptionStatus.Canceled]: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

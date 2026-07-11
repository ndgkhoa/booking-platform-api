export const SubscriptionStatus = {
  Trialing: 'trialing',
  Active: 'active',
  PastDue: 'past_due',
  Canceled: 'canceled',
} as const;

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Statuses that entitle a tenant to plan features. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.Trialing,
  SubscriptionStatus.Active,
];

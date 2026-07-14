// Billing plan codes seeded by the Billing migration; single source of truth for `code` values.
export const PlanCode = {
  Free: 'free',
  Pro: 'pro',
} as const;

export type PlanCode = (typeof PlanCode)[keyof typeof PlanCode];

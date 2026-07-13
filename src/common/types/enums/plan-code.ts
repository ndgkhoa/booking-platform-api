/**
 * Billing plan codes. These rows are seeded by the Billing migration; this const
 * is the single source of truth for their `code` values so lookups never rely on
 * a bare string literal.
 */
export const PlanCode = {
  Free: 'free',
  Pro: 'pro',
} as const;

export type PlanCode = (typeof PlanCode)[keyof typeof PlanCode];

/** Tenant lifecycle. A suspended tenant is blocked from all operations. */
export const TenantStatus = {
  Active: 'active',
  Suspended: 'suspended',
} as const;

export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

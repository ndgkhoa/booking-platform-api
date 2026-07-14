/** Roles a user holds within a tenant. Global super_admin is handled separately. */
export const MembershipRole = {
  Owner: 'owner',
  Staff: 'staff',
} as const;

export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

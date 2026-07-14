import type { MembershipRole } from '@common/types/enums/membership-role';

// Authorization vocabulary for `@Authorized(...)`: owner/staff are tenant MembershipRoles,
// super_admin is the global platform flag (users.is_super_admin) bypassing tenant scope.
export type AuthRole = MembershipRole | 'super_admin';

export const Role = {
  SuperAdmin: 'super_admin',
  Owner: 'owner',
  Staff: 'staff',
} as const satisfies Record<string, AuthRole>;

/** Reusable role groups for `@Authorized` — one source of truth, no magic strings. */
export const SUPER_ADMIN_ONLY: AuthRole[] = [Role.SuperAdmin];
export const OWNER_ONLY: AuthRole[] = [Role.Owner];
export const TENANT_MEMBER: AuthRole[] = [Role.Owner, Role.Staff];

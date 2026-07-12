import type { MembershipRole } from '@common/types';

/**
 * Authorization vocabulary used by `@Authorized(...)`. Owner/staff are the
 * tenant `MembershipRole`s carried in the token; `super_admin` is the global
 * platform flag (users.is_super_admin) that bypasses tenant scope.
 *
 * Customer is a separate tenant-scoped actor with its own (future) login path —
 * it is deliberately NOT part of this membership/authorization vocabulary.
 */
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

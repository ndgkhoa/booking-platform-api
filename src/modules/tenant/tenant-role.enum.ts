/**
 * TenantRole a user holds *within a tenant*. Roles live on the tenant membership,
 * never on the global user identity — the same person can be an owner of one
 * tenant and staff of another.
 */
export enum TenantRole {
  OWNER = 'owner',
  STAFF = 'staff',
}

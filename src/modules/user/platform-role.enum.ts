/**
 * Platform-level role, orthogonal to the tenant {@link Role}. It lives on the
 * global user identity (nullable — most users have none) and grants cross-tenant
 * back-office access via the dedicated `/admin` surface. A super admin is not a
 * member of any tenant by virtue of this role; it is a separate authorization
 * axis entirely.
 */
export enum PlatformRole {
  SUPER_ADMIN = 'super_admin',
}

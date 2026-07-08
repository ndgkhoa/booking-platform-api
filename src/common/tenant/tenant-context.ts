import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@modules/tenant/role.enum';

/**
 * Request-scoped tenant context propagated via AsyncLocalStorage. Populated by
 * the tenant-context middleware from the verified access token, then read by
 * the authorization checker and tenant-scoped repositories downstream.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` with the given tenant context active for the whole async subtree. */
export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

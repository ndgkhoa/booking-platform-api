import { AsyncLocalStorage } from 'node:async_hooks';
import { UnauthorizedException } from '@common/exceptions';
import type { EntityManager } from 'typeorm';

// Ambient tenant context for a request; `manager` is set only inside a tenant transaction
// (see tenant-transaction.ts) and points at the RLS-scoped connection.
export interface TenantContext {
  tenantId: string;
  manager?: EntityManager;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(context: TenantContext, work: () => T): T {
  return storage.run(context, work);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Active tenant id; throws for tenant-scoped operations invoked without context. */
export function getTenantId(): string {
  const tenantId = storage.getStore()?.tenantId;
  if (!tenantId) {
    throw new UnauthorizedException('Tenant context is not set');
  }
  return tenantId;
}

export function getTenantIdOrNull(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/** RLS-scoped EntityManager when a tenant transaction is active, else undefined. */
export function getTenantManager(): EntityManager | undefined {
  return storage.getStore()?.manager;
}

import { runWithTenant } from '@common/tenant/tenant-context';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Runs `work` inside a DB transaction pinned to `tenantId` via
 * `set_config('app.tenant_id', ..., true)` — transaction-local (equivalent to
 * `SET LOCAL`), so it never leaks across pooled connections. Postgres RLS
 * policies read this setting and fail closed on cross-tenant rows.
 *
 * The transaction's EntityManager is exposed through the tenant context, so any
 * `BaseTenantRepository` invoked inside runs its queries on the same RLS-scoped
 * connection.
 */
export async function runInTenantContext<T>(
  dataSource: DataSource,
  tenantId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  // `dataSource.transaction` owns connect/commit/rollback/release, so a failure
  // acquiring the connection or starting the transaction cannot leak it.
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return runWithTenant({ tenantId, manager }, () => work(manager));
  });
}

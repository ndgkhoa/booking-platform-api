import { runWithTenant } from '@common/tenant/tenant-context';
import type { DataSource, EntityManager } from 'typeorm';

// Runs `work` in a tx pinned to `tenantId` via transaction-local set_config (never leaks
// across pooled connections); RLS reads this setting and fails closed on cross-tenant rows.
export async function runInTenantContext<T>(
  dataSource: DataSource,
  tenantId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  // dataSource.transaction owns connect/commit/rollback/release, so a failed acquire can't leak it.
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return runWithTenant({ tenantId, manager }, () => work(manager));
  });
}

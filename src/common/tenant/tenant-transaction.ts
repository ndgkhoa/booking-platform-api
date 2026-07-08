import type { DataSource, EntityManager } from 'typeorm';

/**
 * Run `work` inside a transaction that has the Postgres GUC `app.tenant_id` set
 * for its lifetime. RLS policies read this GUC, so every query issued through
 * the provided manager is transparently confined to `tenantId`.
 *
 * `set_config(..., true)` is the functional form of `SET LOCAL`: the setting is
 * scoped to this transaction only and never leaks across pooled connections.
 */
export function withTenantTransaction<T>(
  dataSource: DataSource,
  tenantId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return work(manager);
  });
}

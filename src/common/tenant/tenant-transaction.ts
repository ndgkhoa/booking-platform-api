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
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await runWithTenant({ tenantId, manager: queryRunner.manager }, () =>
      work(queryRunner.manager),
    );
    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

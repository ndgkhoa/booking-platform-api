import { randomUUID } from 'node:crypto';
import type { QueryRunner } from 'typeorm';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

/**
 * Proves Postgres RLS isolates `services` at the database layer. Seeding runs on
 * the superuser connection (which bypasses RLS); to observe the policy actually
 * enforcing we SET ROLE to the app's non-superuser role (created in global-setup).
 */
const APP_RLS_ROLE = 'app_rls_user';

describe('RLS tenant isolation (database layer)', () => {
  let ctx: IntegrationContext;
  let qr: QueryRunner;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    qr = ctx.dataSource.createQueryRunner();
    await qr.connect();

    // `services` already carries the migration's RLS policy + FORCE (global-setup
    // runs the real migrations). Seed as superuser (RLS bypassed): 2 for A, 1 for B.
    for (const [id, name] of [
      [tenantA, 'A'],
      [tenantB, 'B'],
    ]) {
      await qr.query('INSERT INTO "tenants" (id, name, slug) VALUES ($1, $2, $3)', [
        id,
        name,
        `slug-${id}`,
      ]);
    }
    const seed = (tenantId: string, name: string) =>
      qr.query(
        'INSERT INTO "services" (tenant_id, name, duration_min, price_amount) VALUES ($1, $2, 30, 1000)',
        [tenantId, name],
      );
    await seed(tenantA, 'A-One');
    await seed(tenantA, 'A-Two');
    await seed(tenantB, 'B-One');
  });

  afterAll(async () => {
    await qr.query('RESET ROLE');
    await qr.release();
    await ctx.teardown();
  });

  it('shows only the active tenant rows under a non-superuser role', async () => {
    await qr.query(`SET ROLE ${APP_RLS_ROLE}`);
    await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantA]);

    const rows: Array<{ tenant_id: string }> = await qr.query('SELECT tenant_id FROM "services"');
    await qr.query('RESET ROLE');

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);
  });

  it('blocks inserting a row for another tenant (WITH CHECK)', async () => {
    await qr.query(`SET ROLE ${APP_RLS_ROLE}`);
    await qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantA]);

    await expect(
      qr.query(
        'INSERT INTO "services" (tenant_id, name, duration_min, price_amount) VALUES ($1, $2, 30, 1000)',
        [tenantB, 'cross-tenant'],
      ),
    ).rejects.toThrow();

    await qr.query('RESET ROLE');
  });
});

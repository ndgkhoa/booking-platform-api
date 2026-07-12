import { randomUUID } from 'node:crypto';
import type { QueryRunner } from 'typeorm';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

/**
 * Proves the payment-webhook consume path is tenant-safe at the DATABASE layer.
 * The webhook has no auth context: it decodes the tenant from the event
 * reference and runs `runInTenantContext(tenantId)`, i.e. `set app.tenant_id`
 * then read/update the subscription. This test drops to a non-superuser role
 * (the app's test connection is a superuser, which bypasses RLS) and exercises
 * exactly that pattern on `subscriptions`, showing a webhook scoped to tenant A
 * can neither see nor modify tenant B's subscription — even given B's row id.
 */
describe('Subscription webhook RLS isolation (database layer)', () => {
  let ctx: IntegrationContext;
  let qr: QueryRunner;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let planId: string;
  let subB: string;

  const asTenant = (tenantId: string) =>
    qr.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    qr = ctx.dataSource.createQueryRunner();
    await qr.connect();

    // The test DB uses synchronize, so apply the RLS the migration ships.
    await qr.query('ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY');
    await qr.query('ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY');
    await qr.query(`
      CREATE POLICY "tenant_isolation" ON "subscriptions"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
    await qr.query('DROP ROLE IF EXISTS sub_rls_tester');
    await qr.query('CREATE ROLE sub_rls_tester NOSUPERUSER');
    await qr.query('GRANT SELECT, INSERT, UPDATE ON "subscriptions" TO sub_rls_tester');

    // Seed as superuser (RLS bypassed): a plan, two tenants, one subscription each.
    // Unique code — the global plans table is shared across suites and not cleaned.
    planId = (
      await qr.query(
        `INSERT INTO "plans" (code, name, price_amount) VALUES ($1, 'RLS', 0) RETURNING id`,
        [`rls-${randomUUID()}`],
      )
    )[0].id;
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
    const seedSub = (tenantId: string, ref: string) =>
      qr.query(
        `INSERT INTO "subscriptions" (tenant_id, plan_id, provider, provider_reference, status)
         VALUES ($1, $2, 'sepay', $3, 'trialing') RETURNING id`,
        [tenantId, planId, ref],
      );
    await seedSub(tenantA, `sub_${tenantA}_${randomUUID()}`);
    subB = (await seedSub(tenantB, `sub_${tenantB}_${randomUUID()}`))[0].id;
  });

  afterAll(async () => {
    await qr.query('RESET ROLE');
    await qr.query('DROP POLICY IF EXISTS "tenant_isolation" ON "subscriptions"');
    await qr.query('ALTER TABLE "subscriptions" NO FORCE ROW LEVEL SECURITY');
    await qr.query('ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY');
    await qr.query('REVOKE ALL ON "subscriptions" FROM sub_rls_tester');
    await qr.query('DROP ROLE IF EXISTS sub_rls_tester');
    await qr.release();
    await ctx.teardown();
  });

  it('sees only the scoped tenant subscription (webhook findByReference)', async () => {
    await qr.query('SET ROLE sub_rls_tester');
    await asTenant(tenantA);
    const rows: Array<{ tenant_id: string }> = await qr.query(
      'SELECT tenant_id FROM "subscriptions"',
    );
    await qr.query('RESET ROLE');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenant_id).toBe(tenantA);
  });

  it("cannot update another tenant's subscription even with its id", async () => {
    await qr.query('SET ROLE sub_rls_tester');
    await asTenant(tenantA);
    // A webhook scoped to A applies an update; B's row is invisible under RLS,
    // so the UPDATE matches zero rows rather than flipping B's status.
    await qr.query(`UPDATE "subscriptions" SET status = 'active' WHERE id = $1`, [subB]);
    await qr.query('RESET ROLE');

    // Confirm as superuser that B is untouched.
    const [b]: Array<{ status: string }> = await qr.query(
      'SELECT status FROM "subscriptions" WHERE id = $1',
      [subB],
    );
    expect(b?.status).toBe('trialing');
  });

  it('does apply an update to the scoped tenant own subscription', async () => {
    await qr.query('SET ROLE sub_rls_tester');
    await asTenant(tenantA);
    await qr.query(`UPDATE "subscriptions" SET status = 'active' WHERE tenant_id = $1`, [tenantA]);
    const rows: Array<{ status: string }> = await qr.query('SELECT status FROM "subscriptions"');
    await qr.query('RESET ROLE');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
  });
});

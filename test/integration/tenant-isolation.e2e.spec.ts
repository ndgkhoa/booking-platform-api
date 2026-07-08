import { randomUUID } from 'node:crypto';
import { runWithTenant } from '@common/tenant/tenant-context';
import { withTenantTransaction } from '@common/tenant/tenant-transaction';
import { Role } from '@modules/tenant/role.enum';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { TenantMemberRepository } from '@modules/tenant/tenant-member.repository';
import { User } from '@modules/user/user.entity';
import { startTestApp, stopTestApp, type TestApp } from '@test/integration/support/start-test-app';
import { Container } from 'typedi';
import type { DataSource } from 'typeorm';

interface SeededTenant {
  tenantId: string;
  userId: string;
}

async function seedTenantWithMember(dataSource: DataSource, label: string): Promise<SeededTenant> {
  const users = dataSource.getRepository(User);
  const tenants = dataSource.getRepository(Tenant);
  const members = dataSource.getRepository(TenantMember);

  const user = await users.save(
    users.create({ email: `${label}-${randomUUID()}@test.com`, name: label, passwordHash: 'x' }),
  );
  const tenant = await tenants.save(
    tenants.create({ name: label, slug: `${label}-${randomUUID().slice(0, 8)}` }),
  );
  await members.save(
    members.create({
      tenantId: tenant.id,
      userId: user.id,
      role: Role.OWNER,
      joinedAt: new Date(),
    }),
  );
  return { tenantId: tenant.id, userId: user.id };
}

describe('Tenant isolation', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await startTestApp();
    dataSource = testApp.dataSource;
  }, 120000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  it('app layer: the tenant-scoped repository only returns the active tenant rows', async () => {
    const a = await seedTenantWithMember(dataSource, 'alpha');
    const b = await seedTenantWithMember(dataSource, 'beta');
    const repo = Container.get(TenantMemberRepository);

    const rows = await runWithTenant(
      { tenantId: a.tenantId, userId: a.userId, role: Role.OWNER },
      () => repo.findAllInTenant(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((m) => m.tenantId === a.tenantId)).toBe(true);
    expect(rows.some((m) => m.tenantId === b.tenantId)).toBe(false);
  });

  it('db layer: RLS blocks cross-tenant reads even when the app filter is bypassed', async () => {
    const a = await seedTenantWithMember(dataSource, 'gamma');
    const b = await seedTenantWithMember(dataSource, 'delta');

    // Raw SQL bypasses the application-layer filter entirely; only RLS stands
    // between tenant A's session and tenant B's rows. SET LOCAL ROLE drops the
    // superuser so the policy is actually enforced.
    const rows: Array<{ tenant_id: string }> = await withTenantTransaction(
      dataSource,
      a.tenantId,
      async (manager) => {
        await manager.query('SET LOCAL ROLE app_user');
        return manager.query('SELECT tenant_id FROM tenant_members');
      },
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === a.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenant_id === b.tenantId)).toBe(false);
  });
});

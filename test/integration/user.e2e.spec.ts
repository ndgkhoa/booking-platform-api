import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import { startTestApp, stopTestApp, type TestApp } from '@test/integration/support/start-test-app';
import {
  addMemberToTenant,
  adminToken,
  createOwner,
  staffToken,
} from '@test/integration/support/user.fixture';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('User e2e (tenant-scoped)', () => {
  let testApp: TestApp;
  let app: Express;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await startTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  }, 120000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  it('lists only the caller tenant members, with pagination and name filter', async () => {
    const owner = await createOwner(app, dataSource);
    await addMemberToTenant(dataSource, owner.tenantId, 'Zaphod Beeblebrox');
    await addMemberToTenant(dataSource, owner.tenantId, 'Ford Prefect');

    // A member of a different tenant must never surface.
    const other = await createOwner(app, dataSource);
    await addMemberToTenant(dataSource, other.tenantId, 'Outsider Zaphod');

    const page = await request(app).get('/api/v1/users?page=1&limit=2').set(bearer(owner.token));
    expect(page.status).toBe(200);
    expect(page.body.data.length).toBeLessThanOrEqual(2);
    expect(page.body.meta.total).toBe(3); // owner + 2 seeded members

    const filtered = await request(app).get('/api/v1/users?name=Zaphod').set(bearer(owner.token));
    expect(filtered.body.data.every((u: { name: string }) => u.name.includes('Zaphod'))).toBe(true);
    expect(filtered.body.data.some((u: { name: string }) => u.name === 'Outsider Zaphod')).toBe(
      false,
    );
  });

  it('rejects list for non-owner (403) and invalid limit (422)', async () => {
    const forbidden = await request(app)
      .get('/api/v1/users')
      .set(bearer(await staffToken(dataSource)));
    expect(forbidden.status).toBe(403);

    const badLimit = await request(app)
      .get('/api/v1/users?limit=999')
      .set(bearer(await adminToken(app, dataSource)));
    expect(badLimit.status).toBe(422);
  });

  it('gets a member in the tenant (200) but 404s a member of another tenant', async () => {
    const owner = await createOwner(app, dataSource);
    const memberId = await addMemberToTenant(dataSource, owner.tenantId, 'Trillian');

    const inTenant = await request(app).get(`/api/v1/users/${memberId}`).set(bearer(owner.token));
    expect(inTenant.status).toBe(200);
    expect(inTenant.body.data.id).toBe(memberId);

    const other = await createOwner(app, dataSource);
    const outsiderId = await addMemberToTenant(dataSource, other.tenantId, 'Outsider');
    const cross = await request(app).get(`/api/v1/users/${outsiderId}`).set(bearer(owner.token));
    expect(cross.status).toBe(404);
  });

  it('removes a member from the tenant (204→404); unknown id 404; non-owner 403', async () => {
    const owner = await createOwner(app, dataSource);
    const memberId = await addMemberToTenant(dataSource, owner.tenantId, 'Slartibartfast');

    const del = await request(app).delete(`/api/v1/users/${memberId}`).set(bearer(owner.token));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/v1/users/${memberId}`).set(bearer(owner.token));
    expect(after.status).toBe(404);

    const unknown = await request(app)
      .delete('/api/v1/users/00000000-0000-0000-0000-000000000000')
      .set(bearer(owner.token));
    expect(unknown.status).toBe(404);

    const forbidden = await request(app)
      .delete(`/api/v1/users/${memberId}`)
      .set(bearer(await staffToken(dataSource)));
    expect(forbidden.status).toBe(403);
  });

  it('authorizes by current DB role, not the token role (downgraded owner → 403)', async () => {
    const owner = await createOwner(app, dataSource);
    // Token still claims OWNER; downgrade the membership in the DB to STAFF.
    await dataSource
      .getRepository(TenantMember)
      .update({ userId: owner.userId, tenantId: owner.tenantId }, { role: TenantRole.STAFF });

    const res = await request(app).get('/api/v1/users').set(bearer(owner.token));
    expect(res.status).toBe(403); // 200 would mean the token role was trusted
  });

  it('drops a removed member from the list', async () => {
    const owner = await createOwner(app, dataSource);
    const memberId = await addMemberToTenant(dataSource, owner.tenantId, 'Marvin Paranoid Android');

    const before = await request(app).get('/api/v1/users?name=Marvin').set(bearer(owner.token));
    expect(before.body.data.some((u: { id: string }) => u.id === memberId)).toBe(true);

    await request(app).delete(`/api/v1/users/${memberId}`).set(bearer(owner.token));

    const after = await request(app).get('/api/v1/users?name=Marvin').set(bearer(owner.token));
    expect(after.body.data.some((u: { id: string }) => u.id === memberId)).toBe(false);
  });
});

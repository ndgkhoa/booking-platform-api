import { randomUUID } from 'node:crypto';
import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Admin (super-admin tenant console) e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function owner(): Promise<{ token: string; userId: string; tenantId: string }> {
    const email = `owner-${randomUUID()}@test.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Owner', password: 'password123' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    const onboard = await request(app)
      .post('/api/v1/tenants')
      .set(auth(login.body.data.token))
      .send({ name: 'Spa', slug: `t-${randomUUID().slice(0, 20)}` });
    const token = onboard.body.data.token;
    const claims = jwt.decode(token) as { sub: string; tenantId: string };
    return { token, userId: claims.sub, tenantId: claims.tenantId };
  }

  /** A registered user promoted to the platform super-admin flag; the register
   * token carries no tenant, and the flag is read fresh from the DB per request. */
  async function superAdmin(): Promise<string> {
    const email = `sa-${randomUUID()}@test.com`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Root', password: 'password123' });
    const token = reg.body.data.token;
    const userId = (jwt.decode(token) as { sub: string }).sub;
    await ctx.dataSource.query('UPDATE "users" SET "is_super_admin" = true WHERE "id" = $1', [
      userId,
    ]);
    return token;
  }

  it('lists tenants and views a tenant detail with its subscription', async () => {
    const { tenantId } = await owner();
    const saToken = await superAdmin();

    const list = await request(app).get('/api/v1/admin/tenants').set(auth(saToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((t: { id: string }) => t.id === tenantId)).toBe(true);

    const detail = await request(app).get(`/api/v1/admin/tenants/${tenantId}`).set(auth(saToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.tenant.id).toBe(tenantId);
    expect(detail.body.data.subscription).toBeNull();
  });

  it('suspends then reactivates a tenant, auditing each action immutably', async () => {
    const { tenantId } = await owner();
    const saToken = await superAdmin();

    const suspend = await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/suspend`)
      .set(auth(saToken))
      .send({ reason: 'abuse' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe('suspended');

    const react = await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/reactivate`)
      .set(auth(saToken))
      .send({});
    expect(react.status).toBe(200);
    expect(react.body.data.status).toBe('active');

    const logs = await ctx.dataSource
      .getRepository(AdminAuditLog)
      .find({ where: { targetTenantId: tenantId } });
    expect(logs.map((l) => l.action).sort()).toEqual(['tenant.reactivate', 'tenant.suspend']);
    expect(logs.find((l) => l.action === 'tenant.suspend')?.metadata).toEqual({ reason: 'abuse' });
  });

  it('blocks a suspended tenant from operating (403)', async () => {
    const { token, userId, tenantId } = await owner();
    const before = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'Pre' });
    expect(before.status).toBe(201);

    const saToken = await superAdmin();
    await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/suspend`)
      .set(auth(saToken))
      .send({});

    const after = await request(app).get('/api/v1/staff').set(auth(token));
    expect(after.status).toBe(403);
  });

  it('forbids a non-super-admin from admin routes (403)', async () => {
    const { token } = await owner();
    const res = await request(app).get('/api/v1/admin/tenants').set(auth(token));
    expect(res.status).toBe(403);
  });
});

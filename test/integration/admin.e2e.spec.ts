import { randomUUID } from 'node:crypto';
import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authHeader, createOwner } from '../support/api';
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
    const { tenantId } = await createOwner(app);
    const saToken = await superAdmin();

    const list = await request(app).get('/api/v1/admin/tenants').set(authHeader(saToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((t: { id: string }) => t.id === tenantId)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/admin/tenants/${tenantId}`)
      .set(authHeader(saToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.tenant.id).toBe(tenantId);
    expect(detail.body.data.subscription).toBeNull();
  });

  it('suspends then reactivates a tenant, auditing each action immutably', async () => {
    const { tenantId } = await createOwner(app);
    const saToken = await superAdmin();

    const suspend = await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/suspend`)
      .set(authHeader(saToken))
      .send({ reason: 'abuse' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe('suspended');

    const react = await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/reactivate`)
      .set(authHeader(saToken))
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
    const { token, userId, tenantId } = await createOwner(app);
    const before = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId, displayName: 'Pre' });
    expect(before.status).toBe(201);

    const saToken = await superAdmin();
    await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/suspend`)
      .set(authHeader(saToken))
      .send({});

    const after = await request(app).get('/api/v1/staff').set(authHeader(token));
    expect(after.status).toBe(403);
  });

  it('forbids a non-super-admin from admin routes (403)', async () => {
    const { token } = await createOwner(app);
    const res = await request(app).get('/api/v1/admin/tenants').set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Staff directory & capability e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  async function ownerContext(): Promise<{ token: string; userId: string }> {
    const email = `owner-${randomUUID()}@test.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Owner', password: 'password123' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    const onboard = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ name: 'Spa', slug: `t-${randomUUID().slice(0, 20)}` });
    const token = onboard.body.data.token;
    return { token, userId: (jwt.decode(token) as { sub: string }).sub };
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('creates a staff profile for a tenant member', async () => {
    const { token, userId } = await ownerContext();
    const res = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'Jane Stylist' });
    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe('Jane Stylist');
  });

  it('rejects a staff profile for a non-member (400)', async () => {
    const { token } = await ownerContext();
    const res = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId: randomUUID(), displayName: 'Ghost' });
    expect(res.status).toBe(400);
  });

  it('links and unlinks a service capability', async () => {
    const { token, userId } = await ownerContext();
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'Capable' });
    const service = await request(app)
      .post('/api/v1/services')
      .set(auth(token))
      .send({ name: 'Cut', durationMin: 30, priceAmount: 100000 });
    const staffId = staff.body.data.id;
    const serviceId = service.body.data.id;

    const link = await request(app)
      .post(`/api/v1/staff/${staffId}/services`)
      .set(auth(token))
      .send({ serviceId });
    expect(link.status).toBe(201);

    const list = await request(app).get(`/api/v1/staff/${staffId}/services`).set(auth(token));
    expect(list.body.data.some((c: { serviceId: string }) => c.serviceId === serviceId)).toBe(true);

    const unlink = await request(app)
      .delete(`/api/v1/staff/${staffId}/services/${serviceId}`)
      .set(auth(token));
    expect(unlink.status).toBe(200);
  });

  it('isolates staff across tenants', async () => {
    const a = await ownerContext();
    const b = await ownerContext();
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(auth(a.token))
      .send({ userId: a.userId, displayName: 'Only A' });

    const crossGet = await request(app)
      .get(`/api/v1/staff/${staff.body.data.id}`)
      .set(auth(b.token));
    expect(crossGet.status).toBe(404);
  });
});

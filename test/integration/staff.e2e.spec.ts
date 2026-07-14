import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { authHeader, createOwner } from '../support/api';
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

  it('creates a staff profile for a tenant member', async () => {
    const { token, userId } = await createOwner(app);
    const res = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId, displayName: 'Jane Stylist' });
    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe('Jane Stylist');
  });

  it('rejects a staff profile for a non-member (400)', async () => {
    const { token } = await createOwner(app);
    const res = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId: randomUUID(), displayName: 'Ghost' });
    expect(res.status).toBe(400);
  });

  it('links and unlinks a service capability', async () => {
    const { token, userId } = await createOwner(app);
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId, displayName: 'Capable' });
    const service = await request(app)
      .post('/api/v1/services')
      .set(authHeader(token))
      .send({ name: 'Cut', durationMin: 30, priceAmount: 100000 });
    const staffId = staff.body.data.id;
    const serviceId = service.body.data.id;

    const link = await request(app)
      .post(`/api/v1/staff/${staffId}/services`)
      .set(authHeader(token))
      .send({ serviceId });
    expect(link.status).toBe(201);

    const list = await request(app).get(`/api/v1/staff/${staffId}/services`).set(authHeader(token));
    expect(list.body.data.some((c: { serviceId: string }) => c.serviceId === serviceId)).toBe(true);

    const unlink = await request(app)
      .delete(`/api/v1/staff/${staffId}/services/${serviceId}`)
      .set(authHeader(token));
    expect(unlink.status).toBe(200);
  });

  it('isolates staff across tenants', async () => {
    const a = await createOwner(app);
    const b = await createOwner(app);
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(a.token))
      .send({ userId: a.userId, displayName: 'Only A' });

    const crossGet = await request(app)
      .get(`/api/v1/staff/${staff.body.data.id}`)
      .set(authHeader(b.token));
    expect(crossGet.status).toBe(404);
  });
});

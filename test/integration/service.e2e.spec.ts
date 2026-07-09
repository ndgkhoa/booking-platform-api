import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Service catalog e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  async function ownerToken(): Promise<string> {
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
    return onboard.body.data.token;
  }

  const create = (token: string, body: object) =>
    request(app).post('/api/v1/services').set('Authorization', `Bearer ${token}`).send(body);

  it('lets an owner create and read a service', async () => {
    const token = await ownerToken();
    const res = await create(token, { name: 'Deep Massage', durationMin: 60, priceAmount: 500000 });
    expect(res.status).toBe(201);
    expect(res.body.data.priceCurrency).toBe('VND');

    const got = await request(app)
      .get(`/api/v1/services/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.data.name).toBe('Deep Massage');
  });

  it('rejects creation by a user with no tenant (403) and validation errors (422)', async () => {
    const email = `nt-${randomUUID()}@test.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'NoTenant', password: 'password123' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    const noTenant = await create(login.body.data.token, {
      name: 'X',
      durationMin: 30,
      priceAmount: 1000,
    });
    expect(noTenant.status).toBe(403);

    const owner = await ownerToken();
    const bad = await create(owner, { name: 'A', durationMin: 0, priceAmount: -5 });
    expect(bad.status).toBe(422);
  });

  it('rejects a duplicate service name within a tenant (409)', async () => {
    const token = await ownerToken();
    const body = { name: 'Facial', durationMin: 45, priceAmount: 300000 };
    await create(token, body);
    const dup = await create(token, body);
    expect(dup.status).toBe(409);
  });

  it('isolates services across tenants', async () => {
    const tenantA = await ownerToken();
    const tenantB = await ownerToken();
    const created = await create(tenantA, {
      name: 'Secret A',
      durationMin: 30,
      priceAmount: 100000,
    });
    const idA = created.body.data.id;

    const listB = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${tenantB}`);
    expect(listB.body.data.every((s: { name: string }) => s.name !== 'Secret A')).toBe(true);

    const crossGet = await request(app)
      .get(`/api/v1/services/${idA}`)
      .set('Authorization', `Bearer ${tenantB}`);
    expect(crossGet.status).toBe(404);
  });

  it('updates and soft-deletes a service (owner only)', async () => {
    const token = await ownerToken();
    const created = await create(token, { name: 'Trim', durationMin: 20, priceAmount: 80000 });
    const id = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/services/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priceAmount: 90000, active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.data.priceAmount).toBe(90000);

    const removed = await request(app)
      .delete(`/api/v1/services/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);

    const gone = await request(app)
      .get(`/api/v1/services/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });

  it('allows re-creating a service with the name of a soft-deleted one', async () => {
    const token = await ownerToken();
    const body = { name: 'Reusable', durationMin: 30, priceAmount: 50000 };
    const first = await create(token, body);
    await request(app)
      .delete(`/api/v1/services/${first.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    const recreated = await create(token, body);
    expect(recreated.status).toBe(201);
  });
});

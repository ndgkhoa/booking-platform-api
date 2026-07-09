import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Staff schedule (working hours & time-off) e2e', () => {
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

  /** Owner with one staff profile; returns owner token + staffId. */
  async function ownerWithStaff(): Promise<{ token: string; staffId: string }> {
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
    const userId = (jwt.decode(token) as { sub: string }).sub;
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'Stylist' });
    return { token, staffId: staff.body.data.id };
  }

  it('adds working hours and rejects overlapping intervals', async () => {
    const { token, staffId } = await ownerWithStaff();
    const base = `/api/v1/staff/${staffId}/working-hours`;

    const first = await request(app)
      .post(base)
      .set(auth(token))
      .send({ weekday: 1, startMin: 540, endMin: 720 });
    expect(first.status).toBe(201);

    const overlap = await request(app)
      .post(base)
      .set(auth(token))
      .send({ weekday: 1, startMin: 600, endMin: 800 });
    expect(overlap.status).toBe(409);

    // Half-open: an interval starting exactly at the previous end does not overlap.
    const adjacent = await request(app)
      .post(base)
      .set(auth(token))
      .send({ weekday: 1, startMin: 720, endMin: 900 });
    expect(adjacent.status).toBe(201);
  });

  it('rejects working hours with startMin >= endMin (400)', async () => {
    const { token, staffId } = await ownerWithStaff();
    const res = await request(app)
      .post(`/api/v1/staff/${staffId}/working-hours`)
      .set(auth(token))
      .send({ weekday: 2, startMin: 600, endMin: 600 });
    expect(res.status).toBe(400);
  });

  it('creates time-off and rejects an inverted range (400)', async () => {
    const { token, staffId } = await ownerWithStaff();
    const base = `/api/v1/staff/${staffId}/time-off`;

    const ok = await request(app)
      .post(base)
      .set(auth(token))
      .send({ startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-01T17:00:00Z', reason: 'Leave' });
    expect(ok.status).toBe(201);

    const bad = await request(app)
      .post(base)
      .set(auth(token))
      .send({ startsAt: '2026-08-02T17:00:00Z', endsAt: '2026-08-02T09:00:00Z' });
    expect(bad.status).toBe(400);
  });
});

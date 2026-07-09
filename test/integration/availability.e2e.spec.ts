import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Availability e2e', () => {
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

  interface Fixture {
    token: string;
    staffId: string;
    serviceId: string;
    customerId: string;
  }

  /** Owner + staff able to perform a 60-min service, plus a customer, in a zone. */
  async function fixture(timezone: string, durationMin = 60): Promise<Fixture> {
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
      .send({ name: 'Spa', slug: `t-${randomUUID().slice(0, 20)}`, timezone });
    const token = onboard.body.data.token;
    const userId = (jwt.decode(token) as { sub: string }).sub;

    const staff = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'Stylist' });
    const service = await request(app)
      .post('/api/v1/services')
      .set(auth(token))
      .send({ name: 'Cut', durationMin, priceAmount: 100000 });
    const staffId = staff.body.data.id;
    const serviceId = service.body.data.id;
    await request(app)
      .post(`/api/v1/staff/${staffId}/services`)
      .set(auth(token))
      .send({ serviceId });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(token))
      .send({ name: 'Jane', email: `c-${randomUUID()}@test.com` });

    return { token, staffId, serviceId, customerId: customer.body.data.id };
  }

  const setHours = (f: Fixture, weekday: number, startMin: number, endMin: number) =>
    request(app)
      .post(`/api/v1/staff/${f.staffId}/working-hours`)
      .set(auth(f.token))
      .send({ weekday, startMin, endMin });

  const availability = (f: Fixture, date: string) =>
    request(app)
      .get(`/api/v1/availability?serviceId=${f.serviceId}&date=${date}`)
      .set(auth(f.token));

  it('slices working hours into slots and removes booked ones', async () => {
    const f = await fixture('UTC');
    const date = '2026-09-07';
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    await setHours(f, weekday, 540, 720); // 09:00–12:00 → three 60-min slots

    const before = await availability(f, date);
    expect(before.status).toBe(200);
    expect(before.body.data.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-07T10:00:00.000Z',
      '2026-09-07T11:00:00.000Z',
    ]);

    await request(app).post('/api/v1/bookings').set(auth(f.token)).send({
      staffId: f.staffId,
      serviceId: f.serviceId,
      customerId: f.customerId,
      startsAt: '2026-09-07T10:00:00.000Z',
    });

    const after = await availability(f, date);
    expect(after.body.data.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-07T11:00:00.000Z',
    ]);
  });

  it('computes slots in the tenant timezone (DST offset applied)', async () => {
    const f = await fixture('America/New_York');
    const date = '2026-07-06'; // summer → EDT (UTC-4)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    await setHours(f, weekday, 540, 600); // 09:00–10:00 local

    const res = await availability(f, date);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].startsAt).toBe('2026-07-06T13:00:00.000Z'); // 09:00 EDT = 13:00Z
  });
});

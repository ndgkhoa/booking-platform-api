import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Reporting e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
    await ctx.dataSource.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await ctx.dataSource.query(`
      ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
      ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
        EXCLUDE USING gist (
          "tenant_id" WITH =, "staff_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&
        ) WHERE (status IN ('pending', 'confirmed') AND "deleted_at" IS NULL)
    `);
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

  async function fixture(timezone: string): Promise<Fixture> {
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
      .send({ name: 'Cut', durationMin: 60, priceAmount: 100000 });
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

  async function bookCompleted(f: Fixture, startsAt: string): Promise<void> {
    const created = await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .send({ staffId: f.staffId, serviceId: f.serviceId, customerId: f.customerId, startsAt });
    const id = created.body.data.id;
    const v = created.body.data.version;
    await request(app)
      .post(`/api/v1/bookings/${id}/confirm`)
      .set(auth(f.token))
      .send({ version: v });
    await request(app)
      .post(`/api/v1/bookings/${id}/complete`)
      .set(auth(f.token))
      .send({ version: v + 1 });
  }

  it('aggregates booking counts per day with a status breakdown', async () => {
    const f = await fixture('UTC');
    await bookCompleted(f, '2026-12-01T03:00:00.000Z');
    await bookCompleted(f, '2026-12-01T05:00:00.000Z');
    await bookCompleted(f, '2026-12-02T03:00:00.000Z');

    const res = await request(app)
      .get('/api/v1/reports/bookings?from=2026-12-01&to=2026-12-08&groupBy=day')
      .set(auth(f.token));
    expect(res.status).toBe(200);
    const byBucket = Object.fromEntries(
      res.body.data.map((r: { bucket: string }) => [r.bucket, r]),
    );
    expect(byBucket['2026-12-01'].total).toBe(2);
    expect(byBucket['2026-12-01'].completed).toBe(2);
    expect(byBucket['2026-12-02'].total).toBe(1);
  });

  it('sums revenue only for completed bookings', async () => {
    const f = await fixture('UTC');
    await bookCompleted(f, '2027-01-04T03:00:00.000Z');
    // A pending (not completed) booking must not count toward revenue.
    await request(app).post('/api/v1/bookings').set(auth(f.token)).send({
      staffId: f.staffId,
      serviceId: f.serviceId,
      customerId: f.customerId,
      startsAt: '2027-01-04T05:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/v1/reports/revenue?from=2027-01-01&to=2027-01-31&groupBy=month')
      .set(auth(f.token));
    expect(res.status).toBe(200);
    expect(res.body.data[0].amount).toBe(100000); // one completed × 100000, pending excluded
    expect(res.body.data[0].currency).toBe('VND');
  });

  it('buckets by the tenant timezone (local day, not UTC)', async () => {
    const f = await fixture('America/New_York');
    // 2027-02-02T02:00Z is 2027-02-01 21:00 in New York → local day is Feb 1.
    await bookCompleted(f, '2027-02-02T02:00:00.000Z');

    const res = await request(app)
      .get('/api/v1/reports/bookings?from=2027-01-25&to=2027-02-10&groupBy=day')
      .set(auth(f.token));
    expect(res.body.data.map((r: { bucket: string }) => r.bucket)).toContain('2027-02-01');
  });

  it('rejects an oversized or inverted range (400)', async () => {
    const f = await fixture('UTC');
    const tooBig = await request(app)
      .get('/api/v1/reports/bookings?from=2020-01-01&to=2026-01-01&groupBy=month')
      .set(auth(f.token));
    expect(tooBig.status).toBe(400);

    const inverted = await request(app)
      .get('/api/v1/reports/bookings?from=2027-02-01&to=2027-01-01&groupBy=day')
      .set(auth(f.token));
    expect(inverted.status).toBe(400);
  });

  it('forbids non-owner access (403)', async () => {
    const email = `staff-${randomUUID()}@test.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Nobody', password: 'password123' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    const res = await request(app)
      .get('/api/v1/reports/bookings?from=2027-01-01&to=2027-01-31&groupBy=day')
      .set(auth(login.body.data.token));
    expect(res.status).toBe(403);
  });
});

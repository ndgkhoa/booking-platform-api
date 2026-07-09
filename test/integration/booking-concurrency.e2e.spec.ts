import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

/**
 * The flagship guarantee: under concurrent identical bookings, the Postgres
 * EXCLUDE constraint lets exactly one win. The test DB uses `synchronize`, which
 * does not create EXCLUDE constraints, so we apply the same one the migration
 * ships before exercising it.
 */
describe('Booking concurrency & lifecycle e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
    await ctx.dataSource.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await ctx.dataSource.query(`
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

  /** Owner tenant with a staff that can perform a service, plus a customer. */
  async function fixture(): Promise<Fixture> {
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
    const service = await request(app)
      .post('/api/v1/services')
      .set(auth(token))
      .send({ name: 'Cut', durationMin: 60, priceAmount: 200000 });
    const staffId = staff.body.data.id;
    const serviceId = service.body.data.id;
    await request(app)
      .post(`/api/v1/staff/${staffId}/services`)
      .set(auth(token))
      .send({ serviceId });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(token))
      .send({ name: 'Jane Doe', email: `c-${randomUUID()}@test.com` });

    return { token, staffId, serviceId, customerId: customer.body.data.id };
  }

  const book = (f: Fixture, startsAt: string) =>
    request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .send({ staffId: f.staffId, serviceId: f.serviceId, customerId: f.customerId, startsAt });

  it('lets exactly one of many concurrent identical bookings win', async () => {
    const f = await fixture();
    const startsAt = '2026-09-01T03:00:00.000Z';

    const results = await Promise.all(Array.from({ length: 10 }, () => book(f, startsAt)));
    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    expect(conflicts[0]?.body.code).toBe('BOOKING_SLOT_TAKEN');
  });

  it('frees the slot for rebooking once a booking is cancelled', async () => {
    const f = await fixture();
    const startsAt = '2026-09-02T03:00:00.000Z';

    const first = await book(f, startsAt);
    expect(first.status).toBe(201);
    // Same slot is taken.
    expect((await book(f, startsAt)).status).toBe(409);

    await request(app)
      .post(`/api/v1/bookings/${first.body.data.id}/cancel`)
      .set(auth(f.token))
      .send({ version: first.body.data.version });

    // Cancelled bookings are outside the EXCLUDE WHERE clause → slot is free again.
    expect((await book(f, startsAt)).status).toBe(201);
  });

  it('rejects an illegal status transition (422)', async () => {
    const f = await fixture();
    const created = await book(f, '2026-09-03T03:00:00.000Z');
    const complete = await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/complete`)
      .set(auth(f.token))
      .send({ version: created.body.data.version });
    expect(complete.status).toBe(422); // pending → completed requires confirm first
  });

  it('rejects a stale-version transition (409)', async () => {
    const f = await fixture();
    const created = await book(f, '2026-09-04T03:00:00.000Z');
    const stale = await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/confirm`)
      .set(auth(f.token))
      .send({ version: created.body.data.version + 5 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE_BOOKING');
  });

  it('rejects booking a service the staff cannot perform (400)', async () => {
    const f = await fixture();
    const other = await request(app)
      .post('/api/v1/services')
      .set(auth(f.token))
      .send({ name: 'Unlinked', durationMin: 30, priceAmount: 100000 });
    const res = await request(app).post('/api/v1/bookings').set(auth(f.token)).send({
      staffId: f.staffId,
      serviceId: other.body.data.id,
      customerId: f.customerId,
      startsAt: '2026-09-05T03:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });
});

import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Booking idempotency & ETag/If-Match e2e', () => {
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
      .send({ name: 'Jane', email: `c-${randomUUID()}@test.com` });
    return { token, staffId, serviceId, customerId: customer.body.data.id };
  }

  const body = (f: Fixture, startsAt: string) => ({
    staffId: f.staffId,
    serviceId: f.serviceId,
    customerId: f.customerId,
    startsAt,
  });

  it('replays the same response for a repeated Idempotency-Key without a second booking', async () => {
    const f = await fixture();
    const key = randomUUID();
    const payload = body(f, '2026-10-01T03:00:00.000Z');

    const first = await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .set('Idempotency-Key', key)
      .send(payload);
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .set('Idempotency-Key', key)
      .send(payload);
    expect(replay.status).toBe(201);
    // Replay must match the original response exactly (guards serialization drift).
    expect(replay.body).toEqual(first.body);
  });

  it('rejects a reused Idempotency-Key with a different body (422)', async () => {
    const f = await fixture();
    const key = randomUUID();
    await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .set('Idempotency-Key', key)
      .send(body(f, '2026-10-02T03:00:00.000Z'));

    const conflicting = await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .set('Idempotency-Key', key)
      .send(body(f, '2026-10-02T05:00:00.000Z'));
    expect(conflicting.status).toBe(422);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('deduplicates concurrent same-key requests to a single booking', async () => {
    const f = await fixture();
    const key = randomUUID();
    const payload = body(f, '2026-10-03T03:00:00.000Z');

    const send = () =>
      request(app)
        .post('/api/v1/bookings')
        .set(auth(f.token))
        .set('Idempotency-Key', key)
        .send(payload);

    const results = await Promise.all([send(), send(), send()]);
    const created = results.filter((r) => r.status === 201);
    const ids = new Set(created.map((r) => r.body.data.id));
    expect(created.length).toBeGreaterThan(0);
    expect(ids.size).toBe(1); // every successful response points at the one booking
  });

  it('exposes an ETag on GET and enforces If-Match on reschedule', async () => {
    const f = await fixture();
    const created = await request(app)
      .post('/api/v1/bookings')
      .set(auth(f.token))
      .send(body(f, '2026-10-04T03:00:00.000Z'));
    const id = created.body.data.id;

    const got = await request(app).get(`/api/v1/bookings/${id}`).set(auth(f.token));
    expect(got.headers.etag).toBe(`"${created.body.data.version}"`);

    // Stale If-Match → 412.
    const stale = await request(app)
      .patch(`/api/v1/bookings/${id}/reschedule`)
      .set(auth(f.token))
      .set('If-Match', '"999"')
      .send({ startsAt: '2026-10-04T05:00:00.000Z' });
    expect(stale.status).toBe(412);

    // Correct If-Match → success.
    const ok = await request(app)
      .patch(`/api/v1/bookings/${id}/reschedule`)
      .set(auth(f.token))
      .set('If-Match', String(got.headers.etag))
      .send({ startsAt: '2026-10-04T06:00:00.000Z' });
    expect(ok.status).toBe(200);
  });
});

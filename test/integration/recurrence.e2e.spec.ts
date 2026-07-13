import { randomUUID } from 'node:crypto';
import { Booking } from '@modules/booking/booking.entity';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import type { Express } from 'express';
import request from 'supertest';
import { authHeader, createOwner } from '../support/api';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Recurring bookings e2e', () => {
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

  const bookings = () => ctx.dataSource.getRepository(Booking);

  interface Fixture {
    token: string;
    staffId: string;
    serviceId: string;
    customerId: string;
  }

  async function fixture(): Promise<Fixture> {
    const { token, userId } = await createOwner(app);
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId, displayName: 'Stylist' });
    const service = await request(app)
      .post('/api/v1/services')
      .set(authHeader(token))
      .send({ name: 'Cut', durationMin: 60, priceAmount: 100000 });
    const staffId = staff.body.data.id;
    const serviceId = service.body.data.id;
    await request(app)
      .post(`/api/v1/staff/${staffId}/services`)
      .set(authHeader(token))
      .send({ serviceId });
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(authHeader(token))
      .send({ name: 'Jane', email: `c-${randomUUID()}@test.com` });
    return { token, staffId, serviceId, customerId: customer.body.data.id };
  }

  const createRecurring = (f: Fixture, body: object) =>
    request(app)
      .post('/api/v1/recurrences')
      .set(authHeader(f.token))
      .send({
        staffId: f.staffId,
        serviceId: f.serviceId,
        customerId: f.customerId,
        startMinutes: 540,
        ...body,
      });

  it('expands a weekly series into individual EXCLUDE-guarded bookings', async () => {
    const f = await fixture();
    const res = await createRecurring(f, {
      freq: 'weekly',
      interval: 1,
      weekdays: [1],
      startDate: '2028-01-03', // Monday
      count: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toHaveLength(3);
    expect(res.body.data.skipped).toHaveLength(0);

    const rows = await bookings().find({ where: { recurrenceId: res.body.data.recurrenceId } });
    expect(rows).toHaveLength(3);
    expect(rows.every((b) => b.status === 'pending')).toBe(true);
  });

  it('skip_conflicts creates the free occurrences and reports the clashing one', async () => {
    const f = await fixture();
    // Pre-book the slot the second occurrence would want.
    await request(app).post('/api/v1/bookings').set(authHeader(f.token)).send({
      staffId: f.staffId,
      serviceId: f.serviceId,
      customerId: f.customerId,
      startsAt: '2028-02-14T09:00:00.000Z', // 2028-02-14 is a Monday
    });

    const res = await createRecurring(f, {
      freq: 'weekly',
      interval: 1,
      weekdays: [1],
      startDate: '2028-02-07', // Mon; occurrences 02-07, 02-14 (taken), 02-21
      count: 3,
      conflictPolicy: 'skip_conflicts',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toHaveLength(2);
    expect(res.body.data.skipped).toEqual(['2028-02-14T09:00:00.000Z']);
  });

  it('all_or_nothing rolls back the whole series on any conflict (409)', async () => {
    const f = await fixture();
    await request(app).post('/api/v1/bookings').set(authHeader(f.token)).send({
      staffId: f.staffId,
      serviceId: f.serviceId,
      customerId: f.customerId,
      startsAt: '2028-03-13T09:00:00.000Z', // Monday, clashes with occurrence 2
    });

    const res = await createRecurring(f, {
      freq: 'weekly',
      interval: 1,
      weekdays: [1],
      startDate: '2028-03-06',
      count: 3,
      conflictPolicy: 'all_or_nothing',
    });
    expect(res.status).toBe(409);

    // No occurrence rows persisted (only the standalone pre-booking exists).
    const seriesRows = await bookings()
      .createQueryBuilder('b')
      .where('b.recurrence_id IS NOT NULL')
      .andWhere('b.starts_at >= :from', { from: '2028-03-01' })
      .getMany();
    expect(seriesRows).toHaveLength(0);
  });

  it('cancels all future occurrences of a series', async () => {
    const f = await fixture();
    const created = await createRecurring(f, {
      freq: 'weekly',
      interval: 1,
      weekdays: [1],
      startDate: '2028-05-01',
      count: 3,
    });
    const recurrenceId = created.body.data.recurrenceId;

    const cancel = await request(app)
      .post(`/api/v1/recurrences/${recurrenceId}/cancel`)
      .set(authHeader(f.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.cancelled).toBe(3);

    const rows = await bookings().find({ where: { recurrenceId } });
    expect(rows.every((b) => b.status === 'cancelled')).toBe(true);

    // A cancelled event is emitted per occurrence so downstream consumers update.
    const events = ctx.dataSource.getRepository(OutboxEvent);
    const cancelledEvents = await events
      .createQueryBuilder('e')
      .where(`e.event_type = 'booking.cancelled'`)
      .andWhere(`e.payload->>'bookingId' IN (:...ids)`, { ids: rows.map((r) => r.id) })
      .getCount();
    expect(cancelledEvents).toBe(3);
  });

  it('rejects weekdays on a daily recurrence (400)', async () => {
    const f = await fixture();
    const res = await createRecurring(f, {
      freq: 'daily',
      interval: 1,
      weekdays: [1],
      startDate: '2028-06-01',
      count: 2,
    });
    expect(res.status).toBe(400);
  });
});

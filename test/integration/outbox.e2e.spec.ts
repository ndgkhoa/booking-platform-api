import { randomUUID } from 'node:crypto';
import { OutboxService } from '@modules/outbox/outbox.service';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import { authHeader, createOwner } from '../support/api';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

// Verifies outbox events are written atomically with the booking change and the relay drains committed ones.
describe('Transactional outbox e2e', () => {
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

  const events = () => ctx.dataSource.getRepository(OutboxEvent);

  interface Fixture {
    token: string;
    tenantId: string;
    staffId: string;
    serviceId: string;
    customerId: string;
  }

  async function fixture(): Promise<Fixture> {
    const { token, userId, tenantId } = await createOwner(app);
    const staff = await request(app)
      .post('/api/v1/staff')
      .set(authHeader(token))
      .send({ userId, displayName: 'Stylist' });
    const service = await request(app)
      .post('/api/v1/services')
      .set(authHeader(token))
      .send({ name: 'Cut', durationMin: 60, priceAmount: 200000 });
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
    return {
      token,
      tenantId,
      staffId,
      serviceId,
      customerId: customer.body.data.id,
    };
  }

  const book = (f: Fixture, startsAt: string) =>
    request(app)
      .post('/api/v1/bookings')
      .set(authHeader(f.token))
      .send({ staffId: f.staffId, serviceId: f.serviceId, customerId: f.customerId, startsAt });

  it('writes booking.created atomically and none on a rolled-back booking', async () => {
    const f = await fixture();
    const startsAt = '2026-11-01T03:00:00.000Z';

    const created = await book(f, startsAt);
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id;

    const afterCreate = await events().find({ where: { aggregateId: bookingId } });
    expect(afterCreate).toHaveLength(1);
    expect(afterCreate[0]?.eventType).toBe('booking.created');
    expect(afterCreate[0]?.status).toBe('pending');

    // A conflicting booking rolls back — its would-be event must not persist.
    const conflict = await book(f, startsAt);
    expect(conflict.status).toBe(409);
    const total = await events().count({ where: { tenantId: f.tenantId } });
    expect(total).toBe(1); // still only the successful booking's event
  });

  it('emits a status-change event on confirm', async () => {
    const f = await fixture();
    const created = await book(f, '2026-11-02T03:00:00.000Z');
    await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/confirm`)
      .set(authHeader(f.token))
      .send({ version: created.body.data.version });

    const rows = await events().find({ where: { aggregateId: created.body.data.id } });
    expect(rows.map((r) => r.eventType).sort()).toEqual(['booking.confirmed', 'booking.created']);
  });

  it('relay dispatches pending events and leaves this tenant with none pending', async () => {
    const f = await fixture();
    await book(f, '2026-11-03T03:00:00.000Z');

    // Drain the whole outbox (the relay is cross-tenant by design).
    const relay = Container.get(OutboxService);
    const dispatched: string[] = [];
    let processed: number;
    do {
      processed = await relay.processBatch(async (e) => {
        dispatched.push(e.eventType);
      });
    } while (processed > 0);

    expect(dispatched).toContain('booking.created');
    expect(await events().count({ where: { tenantId: f.tenantId, status: 'pending' } })).toBe(0);
    expect(
      await events().count({ where: { tenantId: f.tenantId, status: 'dispatched' } }),
    ).toBeGreaterThan(0);
  });
});

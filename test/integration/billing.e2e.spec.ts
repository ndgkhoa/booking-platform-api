import { createHmac, randomUUID } from 'node:crypto';
import { Plan } from '@modules/plan/plan.entity';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

const SEPAY_SECRET = 'dev-sepay-secret'; // matches SEPAY_WEBHOOK_SECRET env default

describe('Billing (subscriptions + signed webhooks + entitlement) e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;
  let freePlanId: string;
  let proPlanId: string;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
    const plans = ctx.dataSource.getRepository(Plan);
    freePlanId = (
      await plans.save(
        plans.create({
          code: 'free',
          name: 'Free',
          priceAmount: 0,
          maxStaff: 1,
          maxBookingsPerMonth: 100,
        }),
      )
    ).id;
    proPlanId = (
      await plans.save(
        plans.create({
          code: 'pro',
          name: 'Pro',
          priceAmount: 20000000,
          maxStaff: -1,
          maxBookingsPerMonth: -1,
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function owner(): Promise<{ token: string; userId: string }> {
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

  const sepaySig = (body: object) =>
    createHmac('sha256', SEPAY_SECRET).update(JSON.stringify(body)).digest('hex');

  /** Registers a new user and makes them a staff-role member of the owner's tenant. */
  async function addMember(ownerToken: string): Promise<string> {
    const email = `m-${randomUUID()}@test.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Member', password: 'password123' });
    const invite = await request(app)
      .post('/api/v1/invites')
      .set(auth(ownerToken))
      .send({ email, role: 'staff' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    await request(app)
      .post('/api/v1/invites/accept')
      .set(auth(login.body.data.token))
      .send({ token: invite.body.data.token });
    return (jwt.decode(login.body.data.token) as { sub: string }).sub;
  }

  it('subscribes via a chosen provider and activates on a signed webhook', async () => {
    const { token } = await owner();
    const sub = await request(app)
      .post('/api/v1/subscriptions')
      .set(auth(token))
      .send({ planId: proPlanId, provider: 'sepay' });
    expect(sub.status).toBe(201);
    expect(sub.body.data.checkout.provider).toBe('sepay');
    const reference = sub.body.data.checkout.reference;

    const event = { id: `evt_${randomUUID()}`, status: 'success', content: reference };
    const hook = await request(app)
      .post('/api/v1/payments/webhooks/sepay')
      .set('x-webhook-signature', sepaySig(event))
      .send(event);
    expect(hook.status).toBe(200);

    const current = await request(app).get('/api/v1/subscriptions/current').set(auth(token));
    expect(current.body.data.status).toBe('active');
  });

  it('rejects a webhook with a bad signature (401) and is idempotent on replay', async () => {
    const { token } = await owner();
    const sub = await request(app)
      .post('/api/v1/subscriptions')
      .set(auth(token))
      .send({ planId: proPlanId, provider: 'sepay' });
    const reference = sub.body.data.checkout.reference;
    const event = { id: `evt_${randomUUID()}`, status: 'success', content: reference };

    const bad = await request(app)
      .post('/api/v1/payments/webhooks/sepay')
      .set('x-webhook-signature', 'deadbeef')
      .send(event);
    expect(bad.status).toBe(401);

    // Two valid deliveries of the same event → still exactly one activation, no error.
    const sig = sepaySig(event);
    await request(app)
      .post('/api/v1/payments/webhooks/sepay')
      .set('x-webhook-signature', sig)
      .send(event);
    const replay = await request(app)
      .post('/api/v1/payments/webhooks/sepay')
      .set('x-webhook-signature', sig)
      .send(event);
    expect(replay.status).toBe(200);
    const current = await request(app).get('/api/v1/subscriptions/current').set(auth(token));
    expect(current.body.data.status).toBe('active');
  });

  it('enforces the plan staff limit (402 over cap)', async () => {
    const { token, userId } = await owner();
    // Subscribe to the free plan (maxStaff=1) and activate it.
    const sub = await request(app)
      .post('/api/v1/subscriptions')
      .set(auth(token))
      .send({ planId: freePlanId, provider: 'sepay' });
    const reference = sub.body.data.checkout.reference;
    const event = { id: `evt_${randomUUID()}`, status: 'success', content: reference };
    await request(app)
      .post('/api/v1/payments/webhooks/sepay')
      .set('x-webhook-signature', sepaySig(event))
      .send(event);

    // First staff ok; a second exceeds the cap.
    const first = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'One' });
    expect(first.status).toBe(201);

    // A second member exceeds the cap.
    const otherUserId = await addMember(token);
    const second = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId: otherUserId, displayName: 'Two' });
    expect(second.status).toBe(402);
    expect(second.body.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('caps an unsubscribed tenant at the default free plan', async () => {
    // No subscription: the seeded free plan (maxStaff=1) applies by default.
    const { token, userId } = await owner();
    const first = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId, displayName: 'One' });
    expect(first.status).toBe(201);

    const otherUserId = await addMember(token);
    const second = await request(app)
      .post('/api/v1/staff')
      .set(auth(token))
      .send({ userId: otherUserId, displayName: 'Two' });
    expect(second.status).toBe(402);
    expect(second.body.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('rejects an unknown provider (400)', async () => {
    const { token } = await owner();
    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set(auth(token))
      .send({ planId: proPlanId, provider: 'paypal' });
    expect(res.status).toBe(422); // DTO @IsIn rejects before the registry
  });
});

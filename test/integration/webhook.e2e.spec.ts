import { randomUUID } from 'node:crypto';
import { WebhookDeliveryService } from '@modules/webhook/webhook-delivery.service';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Webhook endpoints & delivery e2e', () => {
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

  it('registers a webhook (secret returned once, never on reads)', async () => {
    const token = await ownerToken();
    const created = await request(app)
      .post('/api/v1/webhooks')
      .set(auth(token))
      .send({ url: 'https://hooks.example.com/booking' });
    expect(created.status).toBe(201);
    expect(typeof created.body.data.secret).toBe('string');

    const list = await request(app).get('/api/v1/webhooks').set(auth(token));
    expect(list.body.data[0]).not.toHaveProperty('secret');
  });

  it('rejects an SSRF / non-https webhook URL at registration (400)', async () => {
    const token = await ownerToken();
    for (const url of ['http://hooks.example.com', 'https://127.0.0.1/x', 'https://localhost/x']) {
      const res = await request(app).post('/api/v1/webhooks').set(auth(token)).send({ url });
      expect(res.status).toBe(400);
    }
  });

  it('allows only one active webhook per tenant (409)', async () => {
    const token = await ownerToken();
    await request(app)
      .post('/api/v1/webhooks')
      .set(auth(token))
      .send({ url: 'https://hooks.example.com/a' });
    const dup = await request(app)
      .post('/api/v1/webhooks')
      .set(auth(token))
      .send({ url: 'https://hooks.example.com/b' });
    expect(dup.status).toBe(409);
  });

  it('blocks delivery to a loopback/private target at send time (SSRF)', async () => {
    const delivery = Container.get(WebhookDeliveryService);
    await expect(
      delivery.deliver('https://127.0.0.1/hook', 'secret', {
        eventType: 'booking.created',
        aggregateType: 'booking',
        aggregateId: 'b1',
        data: {},
      }),
    ).rejects.toThrow();
  });
});

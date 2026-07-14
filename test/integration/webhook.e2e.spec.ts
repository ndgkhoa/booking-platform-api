import { WebhookService } from '@modules/webhook/webhook.service';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import { authHeader, createOwner } from '../support/api';
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

  it('registers a webhook (secret returned once, never on reads)', async () => {
    const { token } = await createOwner(app);
    const created = await request(app)
      .post('/api/v1/webhooks')
      .set(authHeader(token))
      .send({ url: 'https://hooks.example.com/booking' });
    expect(created.status).toBe(201);
    expect(typeof created.body.data.secret).toBe('string');

    const list = await request(app).get('/api/v1/webhooks').set(authHeader(token));
    expect(list.body.data[0]).not.toHaveProperty('secret');
  });

  it('rejects an SSRF / non-https webhook URL at registration (400)', async () => {
    const { token } = await createOwner(app);
    for (const url of ['http://hooks.example.com', 'https://127.0.0.1/x', 'https://localhost/x']) {
      const res = await request(app).post('/api/v1/webhooks').set(authHeader(token)).send({ url });
      expect(res.status).toBe(400);
    }
  });

  it('allows only one active webhook per tenant (409)', async () => {
    const { token } = await createOwner(app);
    await request(app)
      .post('/api/v1/webhooks')
      .set(authHeader(token))
      .send({ url: 'https://hooks.example.com/a' });
    const dup = await request(app)
      .post('/api/v1/webhooks')
      .set(authHeader(token))
      .send({ url: 'https://hooks.example.com/b' });
    expect(dup.status).toBe(409);
  });

  it('blocks delivery to a loopback/private target at send time (SSRF)', async () => {
    const delivery = Container.get(WebhookService);
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

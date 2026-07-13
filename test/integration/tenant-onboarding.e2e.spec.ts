import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authHeader } from '../support/api';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Tenant onboarding & tenant-scoped auth e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  async function registerAndLogin(): Promise<{ token: string }> {
    const creds = {
      email: `owner-${randomUUID()}@test.com`,
      name: 'Owner',
      password: 'password123',
    };
    await request(app).post('/api/v1/auth/register').send(creds);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    return { token: login.body.data.token };
  }

  const decode = (token: string) => jwt.decode(token) as { tenantId?: string; role?: string };

  it('registration issues a token with no tenant claim', async () => {
    const { token } = await registerAndLogin();
    const claims = decode(token);
    expect(claims.tenantId).toBeUndefined();
    expect(claims.role).toBeUndefined();
  });

  it('onboards a tenant and returns an owner-scoped token', async () => {
    const { token } = await registerAndLogin();
    const slug = `t-${randomUUID().slice(0, 20)}`;

    const res = await request(app)
      .post('/api/v1/tenants')
      .set(authHeader(token))
      .send({ name: 'Acme Spa', slug });

    expect(res.status).toBe(201);
    expect(res.body.data.tenant.slug).toBe(slug);
    const scoped = decode(res.body.data.token);
    expect(scoped.tenantId).toBe(res.body.data.tenant.id);
    expect(scoped.role).toBe('owner');
  });

  it('rejects onboarding without authentication (401)', async () => {
    const res = await request(app).post('/api/v1/tenants').send({ name: 'X', slug: 'x-tenant' });
    expect(res.status).toBe(401);
  });

  it('rejects a duplicate tenant slug (409)', async () => {
    const { token } = await registerAndLogin();
    const slug = `t-${randomUUID().slice(0, 20)}`;
    const body = { name: 'Dup', slug };
    await request(app).post('/api/v1/tenants').set(authHeader(token)).send(body);
    const dup = await request(app).post('/api/v1/tenants').set(authHeader(token)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('CONFLICT');
  });

  it('login after onboarding issues a tenant-scoped token', async () => {
    const creds = {
      email: `o2-${randomUUID()}@test.com`,
      name: 'Owner2',
      password: 'password123',
    };
    await request(app).post('/api/v1/auth/register').send(creds);
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    await request(app)
      .post('/api/v1/tenants')
      .set(authHeader(first.body.data.token))
      .send({ name: 'Second', slug: `t-${randomUUID().slice(0, 20)}` });

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(decode(relogin.body.data.token).role).toBe('owner');
  });

  it('rejects switch-tenant to a tenant the user does not belong to (401)', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/v1/auth/switch-tenant')
      .set(authHeader(token))
      .send({ tenantId: randomUUID() });
    expect(res.status).toBe(401);
  });
});

import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Refresh-token rotation & reuse detection e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  async function register(): Promise<{ token: string; refreshToken: string }> {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `rt-${randomUUID()}@test.com`,
        name: 'RT User',
        password: 'password123',
      });
    return { token: res.body.data.token, refreshToken: res.body.data.refreshToken };
  }

  it('issues a refresh token on registration', async () => {
    const { refreshToken } = await register();
    expect(typeof refreshToken).toBe('string');
    expect(refreshToken.length).toBeGreaterThanOrEqual(32);
  });

  it('rotates the refresh token, returning a new pair', async () => {
    const { refreshToken } = await register();
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { refreshToken: first } = await register();
    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first });
    const second = rotated.body.data.refreshToken;

    // Replay the already-rotated first token → reuse detected.
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('UNAUTHORIZED');

    // The successor is now revoked too (family burned).
    const successor = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second });
    expect(successor.status).toBe(401);
  });

  it('rejects an unknown refresh token (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('logout revokes the family so the token can no longer rotate', async () => {
    const { refreshToken } = await register();
    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(out.status).toBe(200);

    const after = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);
  });
});

import { startTestApp, stopTestApp, type TestApp } from '@test/integration/support/start-test-app';
import { credentials } from '@test/integration/support/user.fixture';
import type { Express } from 'express';
import request from 'supertest';

describe('Auth e2e', () => {
  let testApp: TestApp;
  let app: Express;

  beforeAll(async () => {
    testApp = await startTestApp();
    app = testApp.app;
  }, 120000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  it('registers a user (201, enveloped, no passwordHash, token issued)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(credentials());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('logs in and accesses /users/me with the token', async () => {
    const creds = credentials();
    await request(app).post('/api/v1/auth/register').send(creds);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    const token = login.body.data.token;

    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(creds.email);
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects /users/me without a token (401)', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid registration payload (422 with field details)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad', name: 'x', password: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  describe('refresh rotation', () => {
    async function registerAndGetTokens() {
      const res = await request(app).post('/api/v1/auth/register').send(credentials());
      return res.body.data as { token: string; refreshToken: string };
    }

    it('rotates a refresh token into a new access + refresh pair', async () => {
      const initial = await registerAndGetTokens();

      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initial.refreshToken });

      expect(rotated.status).toBe(200);
      expect(typeof rotated.body.data.token).toBe('string');
      expect(rotated.body.data.refreshToken).not.toBe(initial.refreshToken);

      // The freshly issued access token authorizes protected routes.
      const me = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${rotated.body.data.token}`);
      expect(me.status).toBe(200);
    });

    it('detects reuse of a rotated refresh token and revokes the whole family', async () => {
      const initial = await registerAndGetTokens();

      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initial.refreshToken });
      expect(rotated.status).toBe(200);

      // Replaying the already-rotated token is treated as theft (401)...
      const replay = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initial.refreshToken });
      expect(replay.status).toBe(401);

      // ...and it revokes the family, so the newest token is now dead too.
      const afterRevoke = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.body.data.refreshToken });
      expect(afterRevoke.status).toBe(401);
    });

    it('rejects an unknown refresh token (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('serializes concurrent rotation of one token: exactly one wins, family dies', async () => {
      const initial = await registerAndGetTokens();

      const [a, b] = await Promise.all([
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: initial.refreshToken }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: initial.refreshToken }),
      ]);

      // One request wins the atomic claim (200); the loser is treated as reuse (401).
      expect([a.status, b.status].sort()).toEqual([200, 401]);

      // Reuse detection revoked the whole family, so even the winner's new token is dead.
      const winner = a.status === 200 ? a : b;
      const after = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: winner.body.data.refreshToken });
      expect(after.status).toBe(401);
    });
  });
});

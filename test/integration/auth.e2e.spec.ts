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
    const res = await request(app).post('/api/auth/register').send(credentials());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('logs in and accesses /users/me with the token', async () => {
    const creds = credentials();
    await request(app).post('/api/auth/register').send(creds);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    const token = login.body.data.token;

    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(creds.email);
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects /users/me without a token (401)', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid registration payload (422 with field details)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad', name: 'x', password: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });
});

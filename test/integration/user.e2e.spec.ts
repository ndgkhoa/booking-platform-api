import { startTestApp, stopTestApp, type TestApp } from '@test/integration/support/start-test-app';
import { adminToken, credentials } from '@test/integration/support/user.fixture';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';

describe('User e2e', () => {
  let testApp: TestApp;
  let app: Express;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await startTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  }, 120000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  it('lists users with pagination and name filter (admin)', async () => {
    const token = await adminToken(app, dataSource);
    const named = { ...credentials(), name: 'Zaphod Beeblebrox' };
    await request(app).post('/api/auth/register').send(named);

    const page = await request(app)
      .get('/api/users?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(page.status).toBe(200);
    expect(page.body.data.length).toBeLessThanOrEqual(2);
    expect(page.body.meta.total).toBeGreaterThan(0);

    const filtered = await request(app)
      .get('/api/users?name=Zaphod')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.every((u: { name: string }) => u.name.includes('Zaphod'))).toBe(true);
  });

  it('rejects list for non-admin (403) and invalid limit (422)', async () => {
    const creds = credentials();
    await request(app).post('/api/auth/register').send(creds);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });

    const forbidden = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(forbidden.status).toBe(403);

    const badLimit = await request(app)
      .get('/api/users?limit=999')
      .set('Authorization', `Bearer ${await adminToken(app, dataSource)}`);
    expect(badLimit.status).toBe(422);
  });

  it('soft-deletes a user (admin) and hides them from subsequent lookups (404)', async () => {
    const admin = await adminToken(app, dataSource);
    const creds = credentials();
    await request(app).post('/api/auth/register').send(creds);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    const userId = (
      await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${login.body.data.token}`)
    ).body.data.id;

    const del = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(204);

    const byId = await request(app)
      .get(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(byId.status).toBe(404);
  });

  it('rejects deleting for non-admin (403) and unknown id (404)', async () => {
    const creds = credentials();
    await request(app).post('/api/auth/register').send(creds);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });

    const forbidden = await request(app)
      .delete('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(forbidden.status).toBe(403);

    const notFound = await request(app)
      .delete('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${await adminToken(app, dataSource)}`);
    expect(notFound.status).toBe(404);
  });

  it('excludes soft-deleted users from list by default, includes with includeDeleted=true', async () => {
    const admin = await adminToken(app, dataSource);
    const named = { ...credentials(), name: 'Marvin Paranoid Android' };
    await request(app).post('/api/auth/register').send(named);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: named.email, password: named.password });
    const userId = (
      await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${login.body.data.token}`)
    ).body.data.id;

    await request(app).delete(`/api/users/${userId}`).set('Authorization', `Bearer ${admin}`);

    const withoutDeleted = await request(app)
      .get('/api/users?name=Marvin')
      .set('Authorization', `Bearer ${admin}`);
    expect(withoutDeleted.body.data).toHaveLength(0);

    const withDeleted = await request(app)
      .get('/api/users?name=Marvin&includeDeleted=true')
      .set('Authorization', `Bearer ${admin}`);
    expect(withDeleted.body.data.some((u: { id: string }) => u.id === userId)).toBe(true);
  });
});

import { randomUUID } from 'node:crypto';
import { User } from '@modules/user/user.entity';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

describe('Auth e2e', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: Express;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [User],
      synchronize: true,
    });
    await dataSource.initialize();
    Container.set(DataSource, dataSource);
    app = createServer();
  }, 120000);

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  });

  const credentials = () => ({
    email: `user-${randomUUID()}@test.com`,
    name: `User ${randomUUID().slice(0, 8)}`,
    password: 'password123',
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
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid registration payload (422 with field details)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad', name: 'x', password: '123' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  async function adminToken(): Promise<string> {
    const creds = credentials();
    await request(app).post('/api/v1/auth/register').send(creds);
    await dataSource
      .getRepository(User)
      .update({ email: creds.email }, { roles: ['admin', 'user'] });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });
    return login.body.data.token;
  }

  it('lists users with pagination and name filter (admin)', async () => {
    const token = await adminToken();
    const named = { ...credentials(), name: 'Zaphod Beeblebrox' };
    await request(app).post('/api/v1/auth/register').send(named);

    const page = await request(app)
      .get('/api/v1/users?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(page.status).toBe(200);
    expect(page.body.data.length).toBeLessThanOrEqual(2);
    expect(page.body.meta.total).toBeGreaterThan(0);

    const filtered = await request(app)
      .get('/api/v1/users?name=Zaphod')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.every((u: { name: string }) => u.name.includes('Zaphod'))).toBe(true);
  });

  it('rejects list for non-admin (403) and invalid limit (422)', async () => {
    const creds = credentials();
    await request(app).post('/api/v1/auth/register').send(creds);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password });

    const forbidden = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(forbidden.status).toBe(403);

    const badLimit = await request(app)
      .get('/api/v1/users?limit=999')
      .set('Authorization', `Bearer ${await adminToken()}`);
    expect(badLimit.status).toBe(422);
  });
});

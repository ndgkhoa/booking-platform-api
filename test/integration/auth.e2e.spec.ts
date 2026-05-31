import { randomUUID } from 'node:crypto';
import { User } from '@modules/user/user.entity';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

/**
 * End-to-end auth flow against a real Postgres (testcontainers). Verifies the
 * full stack: routing-controllers → service → repository → DB, response
 * envelope, JWT auth, and that password hashes never leak.
 */
describe('Auth e2e', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: Express;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [User],
      synchronize: true, // tests build the schema directly (no migrations)
    });
    await dataSource.initialize();
    Container.set(DataSource, dataSource); // repositories inject this
    app = createServer();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  // Inline unique data — @faker-js/faker is ESM-only and incompatible with
  // Jest's CJS runtime (faker is used in the DB seeder, which runs under ts-node).
  const credentials = () => ({
    email: `user-${randomUUID()}@test.com`,
    name: `User ${randomUUID().slice(0, 8)}`,
    password: 'password123',
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

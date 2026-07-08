import { randomUUID } from 'node:crypto';
import { User } from '@modules/user/user.entity';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';

export const credentials = () => ({
  email: `user-${randomUUID()}@test.com`,
  name: `User ${randomUUID().slice(0, 8)}`,
  password: 'password123',
});

export async function adminToken(app: Express, dataSource: DataSource): Promise<string> {
  const creds = credentials();
  await request(app).post('/api/auth/register').send(creds);
  await dataSource.getRepository(User).update({ email: creds.email }, { roles: ['admin', 'user'] });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: creds.email, password: creds.password });
  return login.body.data.token;
}

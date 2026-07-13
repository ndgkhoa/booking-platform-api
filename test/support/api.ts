import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/** Bearer auth header for supertest `.set(...)`. */
export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface OwnerContext {
  token: string; // owner session scoped to the new tenant
  userId: string;
  tenantId: string;
}

/**
 * Registers a fresh user, logs in, and onboards a tenant — returning the owner
 * session plus the ids specs commonly need. Specs that need more (staff, service,
 * customer…) compose additional requests on top of this.
 */
export async function createOwner(
  app: Express,
  overrides: { timezone?: string } = {},
): Promise<OwnerContext> {
  const email = `owner-${randomUUID()}@test.com`;
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, name: 'Owner', password: 'password123' });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'password123' });
  const onboard = await request(app)
    .post('/api/v1/tenants')
    .set(authHeader(login.body.data.token))
    .send({ name: 'Spa', slug: `t-${randomUUID().slice(0, 20)}`, ...overrides });
  const token = onboard.body.data.token;
  const claims = jwt.decode(token) as { sub: string; tenantId: string };
  return { token, userId: claims.sub, tenantId: claims.tenantId };
}

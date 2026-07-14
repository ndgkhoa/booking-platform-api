import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { authHeader, createOwner } from '../support/api';
import { type IntegrationContext, initIntegrationContext } from '../support/integration-context';

describe('Invite flow e2e', () => {
  let ctx: IntegrationContext;
  let app: Express;

  beforeAll(async () => {
    ctx = await initIntegrationContext();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  const password = 'password123';

  async function registerUser(email: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'User', password });
    return res.body.data.token;
  }

  it('lets an owner create an invite (201, returns a token)', async () => {
    const { token: owner } = await createOwner(app);
    const res = await request(app)
      .post('/api/v1/invites')
      .set(authHeader(owner))
      .send({ email: `staff-${randomUUID()}@test.com`, role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('staff');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('rejects invite creation by a non-owner (403)', async () => {
    const plainUser = await registerUser(`nobody-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites')
      .set(authHeader(plainUser))
      .send({ email: 'x@test.com', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('lets the invited recipient accept and become a member', async () => {
    const { token: owner } = await createOwner(app);
    const inviteeEmail = `staff-${randomUUID()}@test.com`;
    const invite = await request(app)
      .post('/api/v1/invites')
      .set(authHeader(owner))
      .send({ email: inviteeEmail, role: 'staff' });
    const inviteToken = invite.body.data.token;

    const inviteeAccess = await registerUser(inviteeEmail);
    const accept = await request(app)
      .post('/api/v1/invites/accept')
      .set(authHeader(inviteeAccess))
      .send({ token: inviteToken });
    expect(accept.status).toBe(200);
    expect(accept.body.data.role).toBe('staff');

    // Next login for the invitee is now scoped to the tenant as staff.
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: inviteeEmail, password });
    expect(relogin.status).toBe(200);
  });

  it('rejects acceptance by a different email (403)', async () => {
    const { token: owner } = await createOwner(app);
    const invite = await request(app)
      .post('/api/v1/invites')
      .set(authHeader(owner))
      .send({ email: `intended-${randomUUID()}@test.com`, role: 'staff' });

    const wrongUser = await registerUser(`wrong-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set(authHeader(wrongUser))
      .send({ token: invite.body.data.token });
    expect(res.status).toBe(403);
  });

  it('rejects a reused invite token (409)', async () => {
    const { token: owner } = await createOwner(app);
    const email = `once-${randomUUID()}@test.com`;
    const invite = await request(app)
      .post('/api/v1/invites')
      .set(authHeader(owner))
      .send({ email, role: 'staff' });
    const token = invite.body.data.token;
    const access = await registerUser(email);

    await request(app).post('/api/v1/invites/accept').set(authHeader(access)).send({ token });
    const reuse = await request(app)
      .post('/api/v1/invites/accept')
      .set(authHeader(access))
      .send({ token });
    expect(reuse.status).toBe(409);
  });

  it('rejects an unknown invite token (404)', async () => {
    const user = await registerUser(`u-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set(authHeader(user))
      .send({ token: 'x'.repeat(64) });
    expect(res.status).toBe(404);
  });
});

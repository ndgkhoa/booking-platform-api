import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
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

  /** Registers an owner and onboards a tenant; returns the owner-scoped token. */
  async function ownerWithTenant(): Promise<string> {
    const token = await registerUser(`owner-${randomUUID()}@test.com`);
    const onboard = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Salon', slug: `t-${randomUUID().slice(0, 20)}` });
    return onboard.body.data.token;
  }

  it('lets an owner create an invite (201, returns a token)', async () => {
    const owner = await ownerWithTenant();
    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${owner}`)
      .send({ email: `staff-${randomUUID()}@test.com`, role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('staff');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('rejects invite creation by a non-owner (403)', async () => {
    const plainUser = await registerUser(`nobody-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${plainUser}`)
      .send({ email: 'x@test.com', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('lets the invited recipient accept and become a member', async () => {
    const owner = await ownerWithTenant();
    const inviteeEmail = `staff-${randomUUID()}@test.com`;
    const invite = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${owner}`)
      .send({ email: inviteeEmail, role: 'staff' });
    const inviteToken = invite.body.data.token;

    const inviteeAccess = await registerUser(inviteeEmail);
    const accept = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${inviteeAccess}`)
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
    const owner = await ownerWithTenant();
    const invite = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${owner}`)
      .send({ email: `intended-${randomUUID()}@test.com`, role: 'staff' });

    const wrongUser = await registerUser(`wrong-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${wrongUser}`)
      .send({ token: invite.body.data.token });
    expect(res.status).toBe(403);
  });

  it('rejects a reused invite token (409)', async () => {
    const owner = await ownerWithTenant();
    const email = `once-${randomUUID()}@test.com`;
    const invite = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${owner}`)
      .send({ email, role: 'staff' });
    const token = invite.body.data.token;
    const access = await registerUser(email);

    await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${access}`)
      .send({ token });
    const reuse = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${access}`)
      .send({ token });
    expect(reuse.status).toBe(409);
  });

  it('rejects an unknown invite token (401)', async () => {
    const user = await registerUser(`u-${randomUUID()}@test.com`);
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${user}`)
      .send({ token: 'x'.repeat(64) });
    expect(res.status).toBe(401);
  });
});

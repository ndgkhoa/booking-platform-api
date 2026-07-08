import { randomUUID } from 'node:crypto';
import { TokenService } from '@modules/auth/token.service';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import { User } from '@modules/user/user.entity';
import type { Express } from 'express';
import request from 'supertest';
import { Container } from 'typedi';
import type { DataSource } from 'typeorm';

export const credentials = () => ({
  email: `user-${randomUUID()}@test.com`,
  name: `User ${randomUUID().slice(0, 8)}`,
  password: 'password123',
});

/** Access token for a freshly registered account — owner of its own tenant. */
export async function adminToken(app: Express, _dataSource: DataSource): Promise<string> {
  const creds = credentials();
  await request(app).post('/api/v1/auth/register').send(creds);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: creds.email, password: creds.password });
  return login.body.data.token;
}

/**
 * Access token for a staff (non-owner) member. Seeds a user + tenant + staff
 * membership directly and signs a token — used to assert owner-only routes 403.
 */
export async function staffToken(dataSource: DataSource): Promise<string> {
  const users = dataSource.getRepository(User);
  const tenants = dataSource.getRepository(Tenant);
  const members = dataSource.getRepository(TenantMember);

  const user = await users.save(
    users.create({ email: `staff-${randomUUID()}@test.com`, name: 'Staff', passwordHash: 'x' }),
  );
  const tenant = await tenants.save(
    tenants.create({ name: 'Staff Co', slug: `staff-${randomUUID().slice(0, 8)}` }),
  );
  await members.save(
    members.create({
      tenantId: tenant.id,
      userId: user.id,
      role: TenantRole.STAFF,
      joinedAt: new Date(),
    }),
  );

  return Container.get(TokenService).signAccess({
    sub: user.id,
    tenantId: tenant.id,
    role: TenantRole.STAFF,
  });
}

/** Register an owner and return their token plus tenant/user ids for seeding. */
export async function createOwner(
  app: Express,
  dataSource: DataSource,
): Promise<{ token: string; userId: string; tenantId: string }> {
  const res = await request(app).post('/api/v1/auth/register').send(credentials());
  const { token, user } = res.body.data;
  const member = await dataSource.getRepository(TenantMember).findOneOrFail({
    where: { userId: user.id },
  });
  return { token, userId: user.id, tenantId: member.tenantId };
}

/** Seed a user + membership directly into a tenant (no invite API yet in Phase 1). */
export async function addMemberToTenant(
  dataSource: DataSource,
  tenantId: string,
  name = 'Member',
  role: TenantRole = TenantRole.STAFF,
): Promise<string> {
  const user = await dataSource.getRepository(User).save(
    dataSource.getRepository(User).create({
      email: `member-${randomUUID()}@test.com`,
      name,
      passwordHash: 'x',
    }),
  );
  await dataSource.getRepository(TenantMember).save(
    dataSource.getRepository(TenantMember).create({
      tenantId,
      userId: user.id,
      role,
      joinedAt: new Date(),
    }),
  );
  return user.id;
}

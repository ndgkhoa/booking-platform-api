import { randomUUID } from 'node:crypto';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import { Service } from 'typedi';
import type { EntityManager } from 'typeorm';

/** Derive a URL-safe, collision-resistant slug from a human name. */
function buildSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'tenant'}-${randomUUID().slice(0, 8)}`;
}

@Service()
export class TenantService {
  /**
   * Create a tenant and attach `userId` as its owner. Takes an EntityManager so
   * it enlists in the caller's transaction (signup must be atomic — no orphan
   * tenant without an owner). This is the seam Phase 2's onboarding builds on.
   */
  async createWithOwner(
    manager: EntityManager,
    params: { userId: string; ownerName: string },
  ): Promise<Tenant> {
    const tenants = manager.getRepository(Tenant);
    const members = manager.getRepository(TenantMember);

    const tenant = await tenants.save(
      tenants.create({
        name: `${params.ownerName}'s workspace`,
        slug: buildSlug(params.ownerName),
      }),
    );
    await members.save(
      members.create({
        tenantId: tenant.id,
        userId: params.userId,
        role: TenantRole.OWNER,
        joinedAt: new Date(),
      }),
    );
    return tenant;
  }
}

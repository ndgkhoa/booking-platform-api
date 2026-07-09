import type { Membership, MembershipRole } from '@modules/membership/membership.entity';
import { MembershipRepository } from '@modules/membership/membership.repository';
import { Service } from 'typedi';

@Service()
export class MembershipService {
  constructor(private readonly memberships: MembershipRepository) {}

  listForUser(userId: string): Promise<Membership[]> {
    return this.memberships.findByUser(userId);
  }

  async resolveRole(userId: string, tenantId: string): Promise<MembershipRole | null> {
    const membership = await this.memberships.findByUserAndTenant(userId, tenantId);
    return membership?.role ?? null;
  }

  create(userId: string, tenantId: string, role: MembershipRole): Promise<Membership> {
    return this.memberships.create({ userId, tenantId, role });
  }
}

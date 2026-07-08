import { getTenantId } from '@common/context/tenant-context';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

@Service()
export class TenantMemberRepository {
  private readonly repo: Repository<TenantMember>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(TenantMember);
  }

  /**
   * Membership used to mint a token at login. A Phase-1 user has exactly one
   * membership (created at signup); multi-tenant selection arrives in Phase 2.
   * Cross-tenant lookup by user — intentionally *not* tenant-scoped.
   */
  findPrimaryForUser(userId: string): Promise<TenantMember | null> {
    return this.repo.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  /** Resolve a user's role in a specific tenant (used when refreshing tokens). */
  findForUserAndTenant(userId: string, tenantId: string): Promise<TenantMember | null> {
    return this.repo.findOne({ where: { userId, tenantId } });
  }

  /**
   * All members of the active tenant. The tenant id is read from the
   * request-scoped context — the application-layer half of the two-layer
   * isolation model (RLS is the database-layer backstop).
   */
  findAllInTenant(): Promise<TenantMember[]> {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('findAllInTenant used outside of a tenant context');
    }
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  /** Soft-delete a member from a tenant (the global user account is untouched). */
  async removeFromTenant(userId: string, tenantId: string): Promise<boolean> {
    const result = await this.repo.softDelete({ userId, tenantId });
    return !!result.affected;
  }
}

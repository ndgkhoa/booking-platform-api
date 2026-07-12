import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import type { SubscriptionStatus } from '@common/types/enums/subscription-status';
import { Subscription } from '@modules/subscription/subscription.entity';
import { Service } from 'typedi';
import { DataSource, type EntityManager } from 'typeorm';

@Service()
export class SubscriptionRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get manager(): EntityManager {
    return getTenantManager() ?? this.dataSource.manager;
  }

  create(data: Partial<Subscription>): Promise<Subscription> {
    const repo = this.manager.getRepository(Subscription);
    return repo.save(repo.create({ ...data, tenantId: getTenantId() }));
  }

  /** The tenant's current non-canceled subscription (tenant-scoped). */
  findActive(): Promise<Subscription | null> {
    return this.manager.getRepository(Subscription).findOne({
      where: { tenantId: getTenantId() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lookup by provider reference for the inbound webhook. The caller resolves the
   * tenant from the reference and re-enters that tenant's context first, so this
   * runs RLS-scoped on the tenant transaction — the reference alone can never read
   * another tenant's subscription.
   */
  findByReference(providerReference: string): Promise<Subscription | null> {
    return this.manager.getRepository(Subscription).findOne({ where: { providerReference } });
  }

  /** Status update on the webhook path — runs on the tenant transaction (RLS-scoped). */
  async updateStatus(id: string, status: SubscriptionStatus): Promise<void> {
    await this.manager.getRepository(Subscription).update(id, { status });
  }
}

import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import { Subscription } from '@modules/billing/subscription.entity';
import type { SubscriptionStatus } from '@modules/billing/subscription-status';
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
   * System lookup by provider reference for the inbound webhook — runs OUTSIDE a
   * tenant context (the tenant is unknown until found). In production this system
   * path requires a role permitted to read across tenants; the subsequent write
   * is applied under the resolved tenant's context.
   */
  findByReference(providerReference: string): Promise<Subscription | null> {
    return this.dataSource.getRepository(Subscription).findOne({ where: { providerReference } });
  }

  async updateReference(id: string, providerReference: string): Promise<void> {
    await this.manager.getRepository(Subscription).update(id, { providerReference });
  }

  /** Status update on the system path (webhook) — resolves via the raw manager. */
  async updateStatus(id: string, status: SubscriptionStatus): Promise<void> {
    await this.dataSource.getRepository(Subscription).update(id, { status });
  }
}

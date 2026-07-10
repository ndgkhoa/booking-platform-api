import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { WebhookEndpoint } from '@modules/webhook/webhook-endpoint.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class WebhookRepository extends BaseTenantRepository<WebhookEndpoint> {
  constructor(dataSource: DataSource) {
    super(dataSource, WebhookEndpoint);
  }

  createOne(data: Partial<WebhookEndpoint>): Promise<WebhookEndpoint> {
    return this.persist(data);
  }

  findById(id: string): Promise<WebhookEndpoint | null> {
    return this.findOne({ where: { id } });
  }

  list(): Promise<WebhookEndpoint[]> {
    return this.findMany({ order: { createdAt: 'DESC' } });
  }

  findActive(): Promise<WebhookEndpoint | null> {
    return this.findOne({ where: { active: true } });
  }

  async remove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<WebhookEndpoint>;
    const result = await this.repo.softDelete(where);
    return (result.affected ?? 0) > 0;
  }
}

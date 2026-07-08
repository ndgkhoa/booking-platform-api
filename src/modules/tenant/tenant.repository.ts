import { Tenant } from '@modules/tenant/tenant.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

@Service()
export class TenantRepository {
  private readonly repo: Repository<Tenant>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Tenant);
  }

  findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug } });
  }

  create(data: Partial<Tenant>): Promise<Tenant> {
    return this.repo.save(this.repo.create(data));
  }
}

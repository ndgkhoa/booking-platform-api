import type { BaseQuery } from '@common/base/query.base';
import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { Service as ServiceEntity } from '@modules/service/service.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class ServiceRepository extends BaseTenantRepository<ServiceEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, ServiceEntity);
  }

  createOne(data: Partial<ServiceEntity>): Promise<ServiceEntity> {
    return this.persist(data);
  }

  findById(id: string): Promise<ServiceEntity | null> {
    return this.findOne({ where: { id } });
  }

  paginate(query: BaseQuery): Promise<[ServiceEntity[], number]> {
    return this.findAndCount({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      order: { name: 'ASC' },
    });
  }

  async update(id: string, data: Partial<ServiceEntity>): Promise<ServiceEntity | null> {
    // Write only the provided columns (no read-modify-write) to avoid clobbering
    // concurrent updates to other fields.
    const where = this.scopedWhere({ id }) as FindOptionsWhere<ServiceEntity>;
    const result = await this.repo.update(where, data);
    if (!result.affected) return null;
    return this.findOne({ where: { id } });
  }

  async softRemove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<ServiceEntity>;
    const result = await this.repo.softDelete(where);
    return (result.affected ?? 0) > 0;
  }
}

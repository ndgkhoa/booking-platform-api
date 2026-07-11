import type { BaseQuery } from '@common/base/query.base';
import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { Staff } from '@modules/staff/staff.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class StaffRepository extends BaseTenantRepository<Staff> {
  constructor(dataSource: DataSource) {
    super(dataSource, Staff);
  }

  createOne(data: Partial<Staff>): Promise<Staff> {
    return this.persist(data);
  }

  findById(id: string): Promise<Staff | null> {
    return this.findOne({ where: { id } });
  }

  count(): Promise<number> {
    return this.repo.count({ where: this.scopedWhere() });
  }

  paginate(query: BaseQuery): Promise<[Staff[], number]> {
    return this.findAndCount({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      order: { displayName: 'ASC' },
    });
  }

  async update(id: string, data: Partial<Staff>): Promise<Staff | null> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<Staff>;
    const result = await this.repo.update(where, data);
    if (!result.affected) return null;
    return this.findById(id);
  }

  async softRemove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<Staff>;
    const result = await this.repo.softDelete(where);
    return (result.affected ?? 0) > 0;
  }
}

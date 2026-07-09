import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { TimeOff } from '@modules/time-off/time-off.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class TimeOffRepository extends BaseTenantRepository<TimeOff> {
  constructor(dataSource: DataSource) {
    super(dataSource, TimeOff);
  }

  createOne(data: Partial<TimeOff>): Promise<TimeOff> {
    return this.persist(data);
  }

  listForStaff(staffId: string): Promise<TimeOff[]> {
    return this.findMany({ where: { staffId }, order: { startsAt: 'ASC' } });
  }

  async remove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<TimeOff>;
    const result = await this.repo.delete(where);
    return (result.affected ?? 0) > 0;
  }
}

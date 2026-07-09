import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { TimeOff } from '@modules/time-off/time-off.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere, LessThan, MoreThan } from 'typeorm';

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

  /** Time-off for a staff overlapping [from, to) — bounded for availability. */
  overlapping(staffId: string, from: Date, to: Date): Promise<TimeOff[]> {
    return this.findMany({ where: { staffId, startsAt: LessThan(to), endsAt: MoreThan(from) } });
  }

  async remove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<TimeOff>;
    const result = await this.repo.delete(where);
    return (result.affected ?? 0) > 0;
  }
}

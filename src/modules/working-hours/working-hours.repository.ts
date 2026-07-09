import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { WorkingHours } from '@modules/working-hours/working-hours.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class WorkingHoursRepository extends BaseTenantRepository<WorkingHours> {
  constructor(dataSource: DataSource) {
    super(dataSource, WorkingHours);
  }

  createOne(data: Partial<WorkingHours>): Promise<WorkingHours> {
    return this.persist(data);
  }

  findForStaffWeekday(staffId: string, weekday: number): Promise<WorkingHours[]> {
    return this.findMany({ where: { staffId, weekday } });
  }

  listForStaff(staffId: string): Promise<WorkingHours[]> {
    return this.findMany({ where: { staffId }, order: { weekday: 'ASC', startMin: 'ASC' } });
  }

  async remove(id: string): Promise<boolean> {
    const where = this.scopedWhere({ id }) as FindOptionsWhere<WorkingHours>;
    const result = await this.repo.delete(where);
    return (result.affected ?? 0) > 0;
  }
}

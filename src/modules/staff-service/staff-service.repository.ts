import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { StaffService } from '@modules/staff-service/staff-service.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere } from 'typeorm';

@Service()
export class StaffServiceRepository extends BaseTenantRepository<StaffService> {
  constructor(dataSource: DataSource) {
    super(dataSource, StaffService);
  }

  link(staffId: string, serviceId: string): Promise<StaffService> {
    return this.persist({ staffId, serviceId });
  }

  listForStaff(staffId: string): Promise<StaffService[]> {
    return this.findMany({ where: { staffId } });
  }

  async unlink(staffId: string, serviceId: string): Promise<boolean> {
    const where = this.scopedWhere({ staffId, serviceId }) as FindOptionsWhere<StaffService>;
    const result = await this.repo.delete(where);
    return (result.affected ?? 0) > 0;
  }
}

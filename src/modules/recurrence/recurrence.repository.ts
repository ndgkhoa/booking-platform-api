import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { Recurrence } from '@modules/recurrence/recurrence.entity';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

@Service()
export class RecurrenceRepository extends BaseTenantRepository<Recurrence> {
  constructor(dataSource: DataSource) {
    super(dataSource, Recurrence);
  }

  createOne(data: Partial<Recurrence>): Promise<Recurrence> {
    return this.persist(data);
  }

  findById(id: string): Promise<Recurrence | null> {
    return this.findOne({ where: { id } });
  }
}

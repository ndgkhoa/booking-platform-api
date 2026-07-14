import { Plan } from '@modules/plan/plan.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

/** Plans are global (not tenant-scoped). */
@Service()
export class PlanRepository {
  private readonly repo: Repository<Plan>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Plan);
  }

  findById(id: string): Promise<Plan | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByCode(code: string): Promise<Plan | null> {
    return this.repo.findOne({ where: { code } });
  }

  list(): Promise<Plan[]> {
    return this.repo.find({ order: { priceAmount: 'ASC' } });
  }
}

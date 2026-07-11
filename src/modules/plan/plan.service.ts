import type { Plan } from '@modules/plan/plan.entity';
import { PlanRepository } from '@modules/plan/plan.repository';
import { Service } from 'typedi';

/** Read access to the global plan catalog. Wraps the repository so callers
 * (controllers, other modules) never touch persistence directly. */
@Service()
export class PlanService {
  constructor(private readonly plans: PlanRepository) {}

  list(): Promise<Plan[]> {
    return this.plans.list();
  }

  findById(id: string): Promise<Plan | null> {
    return this.plans.findById(id);
  }
}

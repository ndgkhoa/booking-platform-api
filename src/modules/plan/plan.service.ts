import { DEFAULT_PLAN_CODE } from '@common/constants';
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

  /** The baseline free tier applied when no paid subscription is in force;
   * null if no free plan is configured (callers then treat it as unmetered). */
  getDefaultPlan(): Promise<Plan | null> {
    return this.plans.findByCode(DEFAULT_PLAN_CODE);
  }
}

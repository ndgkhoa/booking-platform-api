import { PlanService } from '@modules/plan/plan.service';
import { Authorized, Get, JsonController } from 'routing-controllers';
import { Service } from 'typedi';

/** Public plan catalog, readable by any authenticated user. */
@Service()
@JsonController('/plans')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @Get()
  @Authorized()
  list() {
    return this.plans.list();
  }
}

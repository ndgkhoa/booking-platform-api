import { OWNER_ONLY, TENANT_MEMBER } from '@modules/auth/roles';
import { BillingService } from '@modules/billing/billing.service';
import { SubscribeDto } from '@modules/billing/dto/subscribe.dto';
import { PlanRepository } from '@modules/billing/plan.repository';
import { Authorized, Body, Get, HttpCode, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly plans: PlanRepository,
  ) {}

  @Get('/plans')
  @Authorized()
  listPlans() {
    return this.plans.list();
  }

  @Get('/subscription')
  @Authorized(TENANT_MEMBER)
  current() {
    return this.billing.currentSubscription();
  }

  @Post('/subscribe')
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  subscribe(@Body() dto: SubscribeDto) {
    return this.billing.subscribe(dto);
  }
}

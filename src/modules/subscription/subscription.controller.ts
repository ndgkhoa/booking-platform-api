import { OWNER_ONLY, TENANT_MEMBER } from '@modules/auth/roles';
import { CreateSubscriptionDto } from '@modules/subscription/dto/create-subscription.dto';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import { Authorized, Body, Get, HttpCode, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get('/current')
  @Authorized(TENANT_MEMBER)
  current() {
    return this.subscriptions.currentSubscription();
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  subscribe(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptions.subscribe(dto);
  }
}

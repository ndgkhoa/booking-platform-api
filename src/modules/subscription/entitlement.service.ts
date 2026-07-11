import { AppException } from '@common/exceptions';
import { PlanService } from '@modules/plan/plan.service';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import { SubscriptionStatus } from '@modules/subscription/subscription-status';
import { Service } from 'typedi';

/**
 * Enforces plan entitlement limits, fail-closed on overage. A tenant with no
 * plan in force is unmetered; a past_due subscription still enforces the cap.
 * Callers pass their own current usage count to avoid a module dependency cycle.
 */
@Service()
export class EntitlementService {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly plans: PlanService,
  ) {}

  async assertWithinStaffLimit(currentStaffCount: number): Promise<void> {
    const limit = await this.staffLimit();
    if (limit >= 0 && currentStaffCount >= limit) {
      throw new AppException(402, 'PLAN_LIMIT_EXCEEDED', `Plan allows at most ${limit} staff`);
    }
  }

  /**
   * The tenant's plan staff cap, or -1 (unmetered) when no plan is in force. A
   * past_due subscription still enforces the cap — a failed payment must not
   * loosen limits — so only a missing or canceled subscription is unmetered.
   */
  private async staffLimit(): Promise<number> {
    const subscription = await this.subscriptions.currentSubscription();
    if (!subscription || subscription.status === SubscriptionStatus.Canceled) {
      return -1;
    }
    const plan = await this.plans.findById(subscription.planId);
    return plan?.maxStaff ?? -1;
  }
}

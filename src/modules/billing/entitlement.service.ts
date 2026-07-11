import { AppException } from '@common/exceptions';
import { PlanRepository } from '@modules/billing/plan.repository';
import { SubscriptionRepository } from '@modules/billing/subscription.repository';
import { ENTITLED_STATUSES } from '@modules/billing/subscription-status';
import { Service } from 'typedi';

/**
 * Enforces plan entitlement limits, fail-closed on overage. A tenant with no
 * entitled subscription is treated as unmetered (no plan configured), so limits
 * apply only once a plan is in force. Callers pass their own current usage count
 * to avoid a module dependency cycle.
 */
@Service()
export class EntitlementService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
  ) {}

  async assertWithinStaffLimit(currentStaffCount: number): Promise<void> {
    const limit = await this.staffLimit();
    if (limit >= 0 && currentStaffCount >= limit) {
      throw new AppException(402, 'PLAN_LIMIT_EXCEEDED', `Plan allows at most ${limit} staff`);
    }
  }

  /** The active plan's staff cap, or -1 (unlimited/unmetered) when no plan is in force. */
  private async staffLimit(): Promise<number> {
    const subscription = await this.subscriptions.findActive();
    if (!subscription || !ENTITLED_STATUSES.includes(subscription.status)) {
      return -1;
    }
    const plan = await this.plans.findById(subscription.planId);
    return plan?.maxStaff ?? -1;
  }
}

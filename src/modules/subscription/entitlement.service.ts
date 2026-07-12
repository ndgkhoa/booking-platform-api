import { AppException } from '@common/exceptions';
import { PlanService } from '@modules/plan/plan.service';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import { SubscriptionStatus } from '@modules/subscription/subscription-status';
import { Service } from 'typedi';

/**
 * Explicit staff-entitlement outcome. Replaces a magic `-1` that conflated two
 * distinct states — "no plan in force" and "plan grants unlimited" — so only
 * `capped` ever enforces a ceiling.
 */
type StaffEntitlement =
  | { kind: 'unmetered' } // never subscribed or canceled → no limit applies
  | { kind: 'unlimited' } // a plan is in force and grants unlimited staff
  | { kind: 'capped'; max: number };

/**
 * Enforces plan entitlement limits, fail-closed on overage. Callers pass their
 * own current usage count to avoid a module dependency cycle.
 */
@Service()
export class EntitlementService {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly plans: PlanService,
  ) {}

  async assertWithinStaffLimit(currentStaffCount: number): Promise<void> {
    const entitlement = await this.resolveStaffEntitlement();
    if (entitlement.kind === 'capped' && currentStaffCount >= entitlement.max) {
      throw new AppException(
        402,
        'PLAN_LIMIT_EXCEEDED',
        `Plan allows at most ${entitlement.max} staff`,
      );
    }
  }

  /**
   * A tenant with no plan in force is unmetered; a past_due subscription still
   * enforces its plan cap — a failed payment must not loosen limits. A negative
   * plan cap denotes an unlimited plan.
   */
  private async resolveStaffEntitlement(): Promise<StaffEntitlement> {
    const subscription = await this.subscriptions.currentSubscription();
    if (!subscription || subscription.status === SubscriptionStatus.Canceled) {
      return { kind: 'unmetered' };
    }
    const plan = await this.plans.findById(subscription.planId);
    if (!plan || plan.maxStaff < 0) {
      return { kind: 'unlimited' };
    }
    return { kind: 'capped', max: plan.maxStaff };
  }
}

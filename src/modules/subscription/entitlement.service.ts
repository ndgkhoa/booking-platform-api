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
  | { kind: 'unmetered' } // no plan configured at all → fail open, no limit
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
   * Resolves the plan whose caps apply, then maps it to an entitlement. A tenant
   * with no active subscription falls back to the default free tier (canceled
   * counts as unsubscribed); a past_due subscription still enforces its own plan
   * cap — a failed payment must not loosen limits. A negative cap denotes an
   * unlimited plan; no plan configured at all is unmetered (fail open).
   */
  private async resolveStaffEntitlement(): Promise<StaffEntitlement> {
    const subscription = await this.subscriptions.currentSubscription();
    const plan =
      subscription && subscription.status !== SubscriptionStatus.Canceled
        ? await this.plans.findById(subscription.planId)
        : await this.plans.getDefaultPlan();
    if (!plan) {
      return { kind: 'unmetered' };
    }
    if (plan.maxStaff < 0) {
      return { kind: 'unlimited' };
    }
    return { kind: 'capped', max: plan.maxStaff };
  }
}

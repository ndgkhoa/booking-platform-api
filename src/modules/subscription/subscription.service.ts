import { AppException, ConflictException, NotFoundException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import { runInTenantContext } from '@common/tenant/tenant-transaction';
import { SubscriptionStatus } from '@common/types';
import { PaymentService } from '@modules/payment/payment.service';
import type {
  CheckoutSession,
  PaymentEvent,
  PaymentProviderName,
} from '@modules/payment/payment-provider.interface';
import { PlanService } from '@modules/plan/plan.service';
import {
  buildReference,
  tenantFromReference,
} from '@modules/subscription/domain/subscription-reference';
import { canTransition } from '@modules/subscription/domain/subscription-state-machine';
import type { CreateSubscriptionDto } from '@modules/subscription/dto/create-subscription.dto';
import type { Subscription } from '@modules/subscription/subscription.entity';
import { SubscriptionRepository } from '@modules/subscription/subscription.repository';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/**
 * Explicit staff-entitlement outcome. Replaces a magic `-1` that conflated two
 * distinct states — "no plan in force" and "plan grants unlimited" — so only
 * `capped` ever enforces a ceiling.
 */
type StaffEntitlement =
  | { kind: 'unmetered' } // no plan configured at all → fail open, no limit
  | { kind: 'unlimited' } // a plan is in force and grants unlimited staff
  | { kind: 'capped'; max: number };

@Service()
export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanService,
    private readonly payments: PaymentService,
    private readonly dataSource: DataSource,
  ) {}

  currentSubscription(): Promise<Subscription | null> {
    return this.subscriptions.findActive();
  }

  async subscribe(
    dto: CreateSubscriptionDto,
  ): Promise<{ subscription: Subscription; checkout: CheckoutSession }> {
    const plan = await this.plans.findById(dto.planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const existing = await this.subscriptions.findActive();
    if (existing && existing.status !== SubscriptionStatus.Canceled) {
      throw new ConflictException('Tenant already has a subscription');
    }

    const reference = buildReference(getTenantId());
    const checkout = this.payments.createCheckout(dto.provider, {
      reference,
      amount: plan.priceAmount,
      currency: plan.priceCurrency,
      description: plan.name,
    });
    try {
      const subscription = await this.subscriptions.create({
        planId: plan.id,
        provider: dto.provider,
        providerReference: reference,
        status: SubscriptionStatus.Trialing,
      });
      return { subscription, checkout };
    } catch (error) {
      // Partial-unique index is the race-proof backstop for the check above.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Tenant already has a subscription');
      }
      throw error;
    }
  }

  /**
   * Consumes a verified payment event: claims it once and applies it to the
   * subscription — both in ONE tenant-scoped transaction, so RLS covers the
   * write and a failed apply rolls the claim back (the provider then retries).
   */
  async consumeWebhook(provider: PaymentProviderName, event: PaymentEvent): Promise<void> {
    const tenantId = tenantFromReference(event.subscriptionReference);
    if (!tenantId) return; // malformed/foreign reference — ignore
    await runInTenantContext(this.dataSource, tenantId, async () => {
      if (!(await this.payments.claimEvent(provider, event.id))) {
        return; // already processed — idempotent no-op
      }
      const subscription = await this.subscriptions.findByReference(event.subscriptionReference);
      if (!subscription) return;
      const next =
        event.type === 'payment.succeeded' ? SubscriptionStatus.Active : SubscriptionStatus.PastDue;
      // Illegal transition (e.g. a stray event on a canceled sub): the claim is
      // still recorded above, so we ACK and drop rather than 500 into a retry loop.
      if (!canTransition(subscription.status, next)) return;
      await this.subscriptions.updateStatus(subscription.id, next);
    });
  }

  /**
   * Enforces the plan staff limit, fail-closed on overage. The caller passes its
   * own current usage count to avoid a module dependency cycle.
   */
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
    const subscription = await this.currentSubscription();
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

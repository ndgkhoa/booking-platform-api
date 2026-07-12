import { ConflictException, NotFoundException } from '@common/exceptions';
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
import type { CreateSubscriptionDto } from '@modules/subscription/dto/create-subscription.dto';
import type { Subscription } from '@modules/subscription/subscription.entity';
import { SubscriptionRepository } from '@modules/subscription/subscription.repository';
import { buildReference, tenantFromReference } from '@modules/subscription/subscription-reference';
import { canTransition } from '@modules/subscription/subscription-state-machine';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

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
}

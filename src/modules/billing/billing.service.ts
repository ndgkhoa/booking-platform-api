import { ConflictException, NotFoundException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import type { SubscribeDto } from '@modules/billing/dto/subscribe.dto';
import type { CheckoutSession, PaymentEvent } from '@modules/billing/payment-provider.interface';
import { PaymentProviderRegistry } from '@modules/billing/payment-provider.registry';
import { PlanRepository } from '@modules/billing/plan.repository';
import type { Subscription } from '@modules/billing/subscription.entity';
import { SubscriptionRepository } from '@modules/billing/subscription.repository';
import { assertCanTransition } from '@modules/billing/subscription-state-machine';
import { SubscriptionStatus } from '@modules/billing/subscription-status';
import { Service } from 'typedi';

@Service()
export class BillingService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  currentSubscription(): Promise<Subscription | null> {
    return this.subscriptions.findActive();
  }

  /**
   * Starts a subscription: creates a trialing row, then a provider-hosted
   * checkout. The subscription activates only when the provider webhook confirms.
   */
  async subscribe(
    dto: SubscribeDto,
  ): Promise<{ subscription: Subscription; checkout: CheckoutSession }> {
    const plan = await this.plans.findById(dto.planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const existing = await this.subscriptions.findActive();
    if (existing && existing.status !== SubscriptionStatus.Canceled) {
      throw new ConflictException('Tenant already has a subscription');
    }

    const provider = this.providers.get(dto.provider);
    // Two-step: persist to get an id, then bind the provider reference to it.
    const subscription = await this.subscriptions.create({
      planId: plan.id,
      provider: dto.provider,
      providerReference: `pending_${getTenantId()}_${Date.now()}`,
      status: SubscriptionStatus.Trialing,
    });
    const checkout = provider.createCheckout({
      subscriptionId: subscription.id,
      amount: plan.priceAmount,
      currency: plan.priceCurrency,
      description: plan.name,
    });
    await this.subscriptions.updateReference(subscription.id, checkout.reference);
    subscription.providerReference = checkout.reference;
    return { subscription, checkout };
  }

  /**
   * Applies a verified, de-duplicated provider event to the subscription state
   * machine. Idempotency is enforced by the caller (event id). Returns false if
   * the referenced subscription no longer exists.
   */
  async applyPaymentEvent(event: PaymentEvent): Promise<boolean> {
    const subscription = await this.subscriptions.findByReference(event.subscriptionReference);
    if (!subscription) return false;
    const next =
      event.type === 'payment.succeeded' ? SubscriptionStatus.Active : SubscriptionStatus.PastDue;
    assertCanTransition(subscription.status, next);
    await this.subscriptions.updateStatus(subscription.id, next);
    return true;
  }
}

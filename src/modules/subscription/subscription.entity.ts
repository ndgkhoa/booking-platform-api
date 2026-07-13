import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { SubscriptionStatus } from '@common/types';
import type { PaymentProviderName } from '@modules/payment/providers/payment-provider.interface';
import { Column, Entity, Index } from 'typeorm';

/**
 * A tenant's subscription to a plan, settled through a payment provider. At most
 * one active (non-canceled) subscription per tenant. `provider_reference` is the
 * correlation id echoed back on provider webhooks.
 */
@Entity('subscriptions')
@Index(['tenantId'], { unique: true, where: `"status" <> 'canceled' AND "deleted_at" IS NULL` })
export class Subscription extends BaseTenantEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({ type: 'varchar' })
  provider!: PaymentProviderName;

  @Index({ unique: true })
  @Column({ name: 'provider_reference' })
  providerReference!: string;

  @Column({ type: 'varchar', default: SubscriptionStatus.Trialing })
  status!: SubscriptionStatus;
}

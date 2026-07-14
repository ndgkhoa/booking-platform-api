import type {
  CheckoutInput,
  CheckoutSession,
  PaymentEvent,
  PaymentProviderName,
} from '@modules/payment/providers/payment-provider.interface';
import { PaymentProviderRegistry } from '@modules/payment/providers/payment-provider.registry';
import { WebhookReceiptRepository } from '@modules/payment/webhook-receipt.repository';
import { Service } from 'typedi';

/** Exposes only normalised operations; this module knows nothing about subscriptions, so it stays a leaf and the subscription domain depends on it, not the reverse. */
@Service()
export class PaymentService {
  constructor(
    private readonly registry: PaymentProviderRegistry,
    private readonly receipts: WebhookReceiptRepository,
  ) {}

  createCheckout(provider: PaymentProviderName, input: CheckoutInput): CheckoutSession {
    return this.registry.get(provider).createCheckout(input);
  }

  verifyWebhook(provider: PaymentProviderName, rawBody: string, signature: string): boolean {
    return this.registry.get(provider).verifyWebhook(rawBody, signature);
  }

  parseEvent(provider: PaymentProviderName, rawBody: string): PaymentEvent | null {
    return this.registry.get(provider).parseEvent(rawBody);
  }

  /** Claims a provider event once for idempotency; participates in the caller's
   * active tenant transaction so it commits or rolls back with the event's effect. */
  claimEvent(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    return this.receipts.claim(provider, eventId);
  }
}

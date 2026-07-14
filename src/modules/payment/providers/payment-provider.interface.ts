/** Providers this platform can settle payments through. */
export type PaymentProviderName = 'sepay' | 'stripe';

export interface CheckoutInput {
  reference: string; // caller-built correlation id (encodes the tenant)
  amount: number; // integer minor units
  currency: string;
  description: string;
}

export interface CheckoutSession {
  provider: PaymentProviderName;
  reference: string; // our correlation id echoed back on the webhook
  checkoutUrl: string; // provider-hosted checkout / QR page
}

export type PaymentEventType = 'payment.succeeded' | 'payment.failed';

export interface PaymentEvent {
  id: string; // provider event id — idempotency key for consuming
  type: PaymentEventType;
  subscriptionReference: string; // ties the event back to our subscription
}

/** The billing domain depends only on this interface; concrete providers are adapters, and verification/parsing stay pure so they unit-test without live calls. */
export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /** Creates a provider-hosted checkout for a subscription. */
  createCheckout(input: CheckoutInput): CheckoutSession;

  /** Constant-time verification of an inbound webhook using the provider's own secret. */
  verifyWebhook(rawBody: string, signature: string): boolean;

  /** Normalises a verified webhook body into a PaymentEvent, or null if irrelevant. */
  parseEvent(rawBody: string): PaymentEvent | null;
}

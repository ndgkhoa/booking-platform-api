import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@config/env';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentEvent,
  PaymentProvider,
} from '@modules/billing/payment-provider.interface';
import { Service } from 'typedi';

/**
 * Stripe adapter — global hosted Checkout. `createCheckout` builds our reference
 * and the URL to the hosted session (a real deployment would create the session
 * via the Stripe API and return session.url; the reference travels in metadata).
 * Webhooks carry a `Stripe-Signature: t=<ts>,v1=<hmac>` header verified against
 * the signed payload `"<ts>.<body>"`.
 */
@Service()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;

  createCheckout(input: CheckoutInput): CheckoutSession {
    const reference = `sub_${input.subscriptionId}`;
    const url = new URL(`${env.APP_URL}/pay/stripe`);
    url.searchParams.set('ref', reference);
    return { provider: this.name, reference, checkoutUrl: url.toString() };
  }

  verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
    const parts = Object.fromEntries(
      signature.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    const timestamp = parts.t;
    const received = parts.v1;
    if (!timestamp || !received) return false;
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    // Stripe event: { id, type, data: { object: { metadata: { reference } } } }.
    const body = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      data?: { object?: { metadata?: { reference?: string } } };
    };
    const reference = body.data?.object?.metadata?.reference;
    if (!body.id || !reference) return null;
    if (body.type === 'checkout.session.completed' || body.type === 'invoice.paid') {
      return { id: body.id, type: 'payment.succeeded', subscriptionReference: reference };
    }
    if (body.type === 'invoice.payment_failed') {
      return { id: body.id, type: 'payment.failed', subscriptionReference: reference };
    }
    return null;
  }
}

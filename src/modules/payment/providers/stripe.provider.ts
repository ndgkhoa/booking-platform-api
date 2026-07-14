import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@config/env';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentEvent,
  PaymentProvider,
} from '@modules/payment/providers/payment-provider.interface';
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
    const url = new URL(`${env.APP_URL}/pay/stripe`);
    url.searchParams.set('ref', input.reference);
    return { provider: this.name, reference: input.reference, checkoutUrl: url.toString() };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const pairs = signature.split(',').map((kv) => kv.split('=') as [string, string]);
    const timestamp = pairs.find(([key]) => key === 't')?.[1];
    // Stripe sends one `v1` per active secret; during a secret rotation there are
    // several, so collect them all and accept if ANY matches ours.
    const received = pairs.filter(([key]) => key === 'v1').map(([, value]) => value);
    if (!timestamp || received.length === 0) return false;
    // Reject stale signatures — bounds replay of a captured valid event.
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > env.STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }
    const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    return received.some(
      (sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), expectedBuffer),
    );
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    // Stripe event: { id, type, data: { object: { metadata: { reference } } } }.
    let body: {
      id?: string;
      type?: string;
      data?: { object?: { metadata?: { reference?: string } } };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
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

import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeJsonParse } from '@common/utils/safe-json-parse';
import { env } from '@config/env';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentEvent,
  PaymentProvider,
} from '@modules/payment/payment-provider.interface';
import { Service } from 'typedi';

/**
 * SePay adapter — Vietnamese VietQR bank-transfer settlement. Checkout produces a
 * hosted QR page carrying our reference; SePay calls back with an HMAC-SHA256
 * signature over the raw body. The customer transfers via any VietQR-capable
 * banking app.
 */
@Service()
export class SepayProvider implements PaymentProvider {
  readonly name = 'sepay' as const;

  createCheckout(input: CheckoutInput): CheckoutSession {
    const url = new URL(`${env.APP_URL}/pay/sepay`);
    url.searchParams.set('ref', input.reference);
    url.searchParams.set('amount', String(input.amount));
    return { provider: this.name, reference: input.reference, checkoutUrl: url.toString() };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', env.SEPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const received = signature.replace(/^sha256=/, '');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    // SePay body: { id, status: 'success'|'failed', content: '<reference>' }.
    const body = safeJsonParse<{ id?: string; status?: string; content?: string }>(rawBody);
    if (!body?.id || !body.content) return null;
    if (body.status === 'success') {
      return { id: body.id, type: 'payment.succeeded', subscriptionReference: body.content };
    }
    if (body.status === 'failed') {
      return { id: body.id, type: 'payment.failed', subscriptionReference: body.content };
    }
    return null;
  }
}

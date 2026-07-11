import { createHmac } from 'node:crypto';
import { env } from '@config/env';
import { SepayProvider } from '@modules/payment/providers/sepay.provider';
import { StripeProvider } from '@modules/payment/providers/stripe.provider';

describe('SepayProvider', () => {
  const provider = new SepayProvider();
  const secret = env.SEPAY_WEBHOOK_SECRET;

  it('verifies an HMAC-signed body and rejects tampering', () => {
    const body = JSON.stringify({ id: 'e1', status: 'success', content: 'sub_123' });
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(provider.verifyWebhook(body, sig)).toBe(true);
    expect(provider.verifyWebhook(body, `sha256=${sig}`)).toBe(true);
    expect(provider.verifyWebhook(`${body} `, sig)).toBe(false);
    expect(provider.verifyWebhook(body, sig.replace(/.$/, '0'))).toBe(false);
  });

  it('parses success/failure events and ignores others', () => {
    expect(
      provider.parseEvent(JSON.stringify({ id: 'e1', status: 'success', content: 'sub_1' })),
    ).toEqual({ id: 'e1', type: 'payment.succeeded', subscriptionReference: 'sub_1' });
    expect(
      provider.parseEvent(JSON.stringify({ id: 'e2', status: 'failed', content: 'sub_1' }))?.type,
    ).toBe('payment.failed');
    expect(
      provider.parseEvent(JSON.stringify({ id: 'e3', status: 'pending', content: 'sub_1' })),
    ).toBeNull();
  });
});

describe('StripeProvider', () => {
  const provider = new StripeProvider();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const now = () => Math.floor(Date.now() / 1000);

  const sign = (body: string, ts: number) =>
    `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

  it('verifies the t=,v1= signature scheme within the freshness window', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    expect(provider.verifyWebhook(body, sign(body, now()))).toBe(true);
    expect(provider.verifyWebhook(body, sign(body, now()).replace('v1=', 'v1=00'))).toBe(false);
    expect(provider.verifyWebhook(body, 'garbage')).toBe(false);
  });

  it('rejects a stale signature outside the tolerance window', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    const stale = now() - env.STRIPE_WEBHOOK_TOLERANCE_SECONDS - 60;
    expect(provider.verifyWebhook(body, sign(body, stale))).toBe(false);
  });

  it('maps stripe event types to normalised payment events', () => {
    const ok = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { reference: 'sub_9' } } },
    });
    expect(provider.parseEvent(ok)).toEqual({
      id: 'evt_1',
      type: 'payment.succeeded',
      subscriptionReference: 'sub_9',
    });
    const failed = JSON.stringify({
      id: 'evt_2',
      type: 'invoice.payment_failed',
      data: { object: { metadata: { reference: 'sub_9' } } },
    });
    expect(provider.parseEvent(failed)?.type).toBe('payment.failed');
  });
});

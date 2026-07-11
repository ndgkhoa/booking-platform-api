import { createHmac } from 'node:crypto';
import { SepayProvider } from '@modules/billing/providers/sepay.provider';
import { StripeProvider } from '@modules/billing/providers/stripe.provider';

describe('SepayProvider', () => {
  const provider = new SepayProvider();
  const secret = 'sepay-secret';

  it('verifies an HMAC-signed body and rejects tampering', () => {
    const body = JSON.stringify({ id: 'e1', status: 'success', content: 'sub_123' });
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(provider.verifyWebhook(body, sig, secret)).toBe(true);
    expect(provider.verifyWebhook(body, `sha256=${sig}`, secret)).toBe(true);
    expect(provider.verifyWebhook(`${body} `, sig, secret)).toBe(false);
    expect(provider.verifyWebhook(body, sig, 'wrong')).toBe(false);
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
  const secret = 'whsec_test';

  const sign = (body: string, ts = '1700000000') =>
    `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

  it('verifies the t=,v1= signature scheme', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    expect(provider.verifyWebhook(body, sign(body), secret)).toBe(true);
    expect(provider.verifyWebhook(body, sign(body).replace('v1=', 'v1=00'), secret)).toBe(false);
    expect(provider.verifyWebhook(body, 'garbage', secret)).toBe(false);
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

import { signWebhook, verifyWebhook } from '@modules/webhook/webhook-signature';
import { assertSafeWebhookUrl } from '@modules/webhook/webhook-url';

describe('webhook signature', () => {
  const secret = 'shhh';
  const body = JSON.stringify({ event: 'booking.created', id: 'b1' });

  it('produces a stable HMAC that verifies', () => {
    const sig = signWebhook(secret, body);
    expect(sig).toBe(signWebhook(secret, body));
    expect(verifyWebhook(secret, body, sig)).toBe(true);
  });

  it('rejects a tampered body or wrong secret', () => {
    const sig = signWebhook(secret, body);
    expect(verifyWebhook(secret, `${body} `, sig)).toBe(false);
    expect(verifyWebhook('other', body, sig)).toBe(false);
  });
});

describe('webhook URL SSRF guard', () => {
  it('accepts a public https URL', () => {
    expect(assertSafeWebhookUrl('https://hooks.example.com/booking').hostname).toBe(
      'hooks.example.com',
    );
  });

  it('rejects non-https', () => {
    expect(() => assertSafeWebhookUrl('http://hooks.example.com')).toThrow();
  });

  it('rejects private / loopback / metadata targets', () => {
    for (const url of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://10.0.0.5/x',
      'https://192.168.1.1/x',
      'https://172.16.0.1/x',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow();
    }
  });

  it('rejects a malformed URL', () => {
    expect(() => assertSafeWebhookUrl('not a url')).toThrow();
  });
});

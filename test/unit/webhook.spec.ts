import { signWebhook, verifyWebhook } from '@modules/webhook/webhook-signature';
import { validateWebhookUrl } from '@modules/webhook/webhook-url';

describe('webhook signature', () => {
  const secret = 'shhh';
  const signed = `1700000000.${JSON.stringify({ event: 'booking.created', id: 'b1' })}`;

  it('produces a stable HMAC and verifies with the sha256= wire prefix', () => {
    const sig = signWebhook(secret, signed);
    expect(sig).toBe(signWebhook(secret, signed));
    expect(verifyWebhook(secret, signed, `sha256=${sig}`)).toBe(true);
    expect(verifyWebhook(secret, signed, sig)).toBe(true); // prefix optional
  });

  it('rejects tampered content or the wrong secret', () => {
    const sig = signWebhook(secret, signed);
    expect(verifyWebhook(secret, `${signed} `, sig)).toBe(false);
    expect(verifyWebhook('other', signed, sig)).toBe(false);
  });
});

describe('webhook URL SSRF guard (sync literal checks)', () => {
  it('accepts a public https host', () => {
    expect(validateWebhookUrl('https://example.com/booking').hostname).toBe('example.com');
  });

  it('rejects non-https, internal names, and malformed URLs', () => {
    expect(() => validateWebhookUrl('http://example.com')).toThrow();
    expect(() => validateWebhookUrl('not a url')).toThrow();
    expect(() => validateWebhookUrl('https://localhost/x')).toThrow();
    expect(() => validateWebhookUrl('https://db.internal/x')).toThrow();
  });

  it('rejects IPv4 loopback/private/metadata across the whole ranges', () => {
    for (const url of [
      'https://127.0.0.1/x',
      'https://127.0.0.2/x', // whole 127/8, not just .0.0.1
      'https://10.0.0.5/x',
      'https://192.168.1.1/x',
      'https://172.16.0.1/x',
      'https://169.254.169.254/latest/meta-data',
      'https://0.0.0.0/x',
    ]) {
      expect(() => validateWebhookUrl(url)).toThrow();
    }
  });

  it('rejects IPv6 loopback/unique-local/link-local and IPv4-mapped literals', () => {
    for (const url of [
      'https://[::1]/x',
      'https://[fd00::1]/x',
      'https://[fe80::1]/x',
      'https://[::ffff:169.254.169.254]/x', // IPv4-mapped metadata
    ]) {
      expect(() => validateWebhookUrl(url)).toThrow();
    }
  });
});

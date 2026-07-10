import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signature over the raw JSON body, hex-encoded. Receivers recompute
 * this with the shared secret to authenticate the payload and reject tampering.
 */
export function signWebhook(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time comparison of a received signature against the expected one. */
export function verifyWebhook(secret: string, body: string, signature: string): boolean {
  const expected = signWebhook(secret, body);
  if (expected.length !== signature.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

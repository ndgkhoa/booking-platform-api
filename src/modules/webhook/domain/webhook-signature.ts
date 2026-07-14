import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signature over the raw JSON body, hex-encoded. Receivers recompute
 * this with the shared secret to authenticate the payload and reject tampering.
 */
export function signWebhook(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time check against signedContent (the exact string that was signed); accepts the wire header with or without the sha256= prefix. */
export function verifyWebhook(secret: string, signedContent: string, signature: string): boolean {
  const received = signature.replace(/^sha256=/, '');
  const expected = signWebhook(secret, signedContent);
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

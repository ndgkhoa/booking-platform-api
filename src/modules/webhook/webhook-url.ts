import { isIP } from 'node:net';
import { BadRequestException } from '@common/exceptions';

/** Private / loopback / link-local / metadata ranges a webhook must never target. */
function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')) {
    return true;
  }
  if (isIP(lower) === 0) {
    return false; // a hostname (not a literal IP) — DNS-time checks are out of scope here
  }
  return (
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('169.254.') || // link-local incl. cloud metadata 169.254.169.254
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower) ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  );
}

/**
 * Validates a tenant-supplied webhook URL: https only, and not pointed at a
 * private/loopback/metadata address (SSRF guard). Returns the parsed URL.
 */
export function assertSafeWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use https');
  }
  if (isBlockedHost(url.hostname)) {
    throw new BadRequestException('Webhook URL must not target a private or loopback address');
  }
  return url;
}

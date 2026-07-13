import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestException } from '@common/exceptions';

/** True if an IPv4 literal falls in a loopback/private/link-local/reserved range. */
function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || // 0.0.0.0/8
    a === 127 || // loopback 127.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
  );
}

/** True if an IP (v4 or v6, incl. IPv4-mapped IPv6) targets a blocked range. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, or its normalised hex ::ffff:7f00:1)
    // is an IPv4 in disguise — always reject; no legitimate webhook needs it.
    if (lower.startsWith('::ffff:') || lower.startsWith('::ffff0:')) return true;
    return (
      lower === '::1' || // loopback
      lower === '::' || // unspecified
      lower.startsWith('fc') || // unique-local fc00::/7
      lower.startsWith('fd') ||
      lower.startsWith('fe8') || // link-local fe80::/10
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return true; // not a valid IP → treat as blocked
}

/**
 * Sync SSRF validation used at REGISTRATION: https only, not localhost/.internal,
 * and if the host is a literal IP it must not be in a blocked range. Does NOT
 * resolve DNS (registration shouldn't depend on it). Returns the parsed URL.
 */
export function validateWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use https');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')) {
    throw new BadRequestException('Webhook URL must not target an internal host');
  }
  if (isIP(host) !== 0 && isBlockedIp(host)) {
    throw new BadRequestException('Webhook URL must not target a private or loopback address');
  }
  return url;
}

/**
 * Full SSRF check used at DELIVERY (the real connect point): the sync checks PLUS
 * DNS resolution, so an internal hostname or naive rebind is caught before the
 * request goes out. A residual resolve-vs-connect TOCTOU remains (accepted here).
 */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  const url = validateWebhookUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) {
    return url; // already validated as a literal IP above
  }
  const addresses = (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new BadRequestException('Webhook URL must not resolve to a private or loopback address');
  }
  return url;
}

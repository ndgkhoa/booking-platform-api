import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';

/**
 * Provider-reference contract owned by the subscription domain. The reference
 * encodes the tenant (`sub_<tenantId>_<random>`) so an auth-less payment webhook
 * can recover the tenant and re-enter its RLS scope before applying the effect.
 * UUIDs contain no underscore, so the three segments split unambiguously.
 */
export function buildReference(tenantId: string): string {
  return `sub_${tenantId}_${randomUUID()}`;
}

export function tenantFromReference(reference: string): string | null {
  const [prefix, tenantId, nonce] = reference.split('_');
  if (prefix !== 'sub' || !tenantId || !nonce || !isUUID(tenantId)) return null;
  return tenantId;
}

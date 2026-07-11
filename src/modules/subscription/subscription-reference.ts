import { randomUUID } from 'node:crypto';

/**
 * Provider-reference contract owned by the subscription domain. The reference
 * encodes the tenant (`sub_<tenantId>_<random>`) so an auth-less payment webhook
 * can recover the tenant and re-enter its RLS scope before applying the effect.
 */
export function buildReference(tenantId: string): string {
  return `sub_${tenantId}_${randomUUID()}`;
}

export function tenantFromReference(reference: string): string | null {
  const match = reference.match(/^sub_([0-9a-f-]{36})_/i);
  return match?.[1] ?? null;
}

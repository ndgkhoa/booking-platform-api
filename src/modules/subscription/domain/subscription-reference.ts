import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';

/** Encodes the tenant (sub_<tenantId>_<random>) so an auth-less payment webhook can recover it and re-enter RLS scope; UUIDs contain no underscore, so segments split unambiguously. */
export function buildReference(tenantId: string): string {
  return `sub_${tenantId}_${randomUUID()}`;
}

export function tenantFromReference(reference: string): string | null {
  const [prefix, tenantId, nonce] = reference.split('_');
  if (prefix !== 'sub' || !tenantId || !nonce || !isUUID(tenantId)) return null;
  return tenantId;
}

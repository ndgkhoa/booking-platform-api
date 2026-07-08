import { createHash } from 'node:crypto';

/** SHA-256 hex digest — used to store high-entropy tokens at rest, never plaintext. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

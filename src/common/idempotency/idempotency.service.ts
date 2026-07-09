import { createHash } from 'node:crypto';
import { ConflictException } from '@common/exceptions';
import { IdempotencyRepository } from '@common/idempotency/idempotency.repository';
import { Service } from 'typedi';

/**
 * Runs an operation at most once per `Idempotency-Key` (per tenant). Because the
 * whole request executes in one tenant transaction, claiming the key first makes
 * the unique index serialise concurrent same-key requests: the second insert
 * blocks until the first commits, then reads the stored response and replays it.
 * A key reused with a different body is rejected.
 */
@Service()
export class IdempotencyService {
  constructor(private readonly keys: IdempotencyRepository) {}

  async run<T>(
    key: string | undefined,
    requestBody: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return operation();
    }
    const requestHash = hashBody(requestBody);

    const claimedId = await this.keys.claim(key, requestHash);
    if (claimedId === null) {
      // The key already exists (or a concurrent request committed first) → replay.
      return this.replay<T>(key, requestHash);
    }
    const result = await operation();
    await this.keys.complete(claimedId, result as Record<string, unknown>);
    return result;
  }

  private async replay<T>(key: string, requestHash: string): Promise<T> {
    const existing = await this.keys.findByKey(key);
    if (!existing || existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency-Key was used with a different request');
    }
    if (existing.responseBody === null || existing.responseBody === undefined) {
      throw new ConflictException('A request with this Idempotency-Key is still in progress');
    }
    return existing.responseBody as T;
  }
}

function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

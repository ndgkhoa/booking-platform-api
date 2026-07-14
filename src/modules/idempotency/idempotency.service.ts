import { createHash } from 'node:crypto';
import { AppException, ConflictException } from '@common/exceptions';
import { IdempotencyRepository } from '@modules/idempotency/idempotency.repository';
import { instanceToPlain } from 'class-transformer';
import { Service } from 'typedi';

/** Claiming the key first lets the unique index serialise concurrent same-key requests within the request's tenant transaction; the loser replays the winner's stored response. */
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
    // Store the serialised (class-transformer) form so a replay matches a fresh
    // response exactly — including any @Exclude-hidden fields.
    await this.keys.complete(claimedId, instanceToPlain(result) as Record<string, unknown>);
    return result;
  }

  private async replay<T>(key: string, requestHash: string): Promise<T> {
    const existing = await this.keys.findByKey(key);
    if (!existing || existing.requestHash !== requestHash) {
      // Same key, different request body — reused for a different operation.
      throw new AppException(
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used with a different request',
      );
    }
    if (existing.responseBody === null || existing.responseBody === undefined) {
      // Unreachable in the single-transaction flow; defensive only.
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

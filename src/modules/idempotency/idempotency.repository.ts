import { BaseTenantRepository } from '@common/base/tenant-repository.base';
import { getTenantId } from '@common/tenant/tenant-context';
import { IdempotencyKey } from '@modules/idempotency/idempotency-key.entity';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

@Service()
export class IdempotencyRepository extends BaseTenantRepository<IdempotencyKey> {
  constructor(dataSource: DataSource) {
    super(dataSource, IdempotencyKey);
  }

  /** ON CONFLICT DO NOTHING, not a caught unique violation — a raised 23505 would abort the per-request transaction and poison the follow-up read. */
  async claim(key: string, requestHash: string): Promise<string | null> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKey)
      .values({ key, requestHash, tenantId: getTenantId() })
      .orIgnore()
      .returning('id')
      .execute();
    return (result.raw[0]?.id as string | undefined) ?? null;
  }

  findByKey(key: string): Promise<IdempotencyKey | null> {
    return this.findOne({ where: { key } });
  }

  async complete(id: string, responseBody: Record<string, unknown>): Promise<void> {
    // jsonb assignment via a bound parameter — sidesteps TypeORM's DeepPartial
    // typing for arbitrary JSON payloads.
    await this.repo
      .createQueryBuilder()
      .update(IdempotencyKey)
      .set({ responseBody: () => 'CAST(:body AS jsonb)' })
      .setParameter('body', JSON.stringify(responseBody))
      .where('id = :id', { id })
      .execute();
  }
}

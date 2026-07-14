import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/** request_hash binds the key to a specific request body so a reused key with a different body is rejected; response_body replays the original result on retry. */
@Entity('idempotency_keys')
@Index(['tenantId', 'key'], { unique: true })
export class IdempotencyKey extends BaseTenantEntity {
  @Column()
  key!: string;

  @Column({ name: 'request_hash' })
  requestHash!: string;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody?: Record<string, unknown> | null;
}

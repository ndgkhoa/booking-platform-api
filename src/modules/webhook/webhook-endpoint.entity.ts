import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';

@Entity('webhook_endpoints')
@Index(['tenantId'], { unique: true, where: `"active" AND "deleted_at" IS NULL` })
export class WebhookEndpoint extends BaseTenantEntity {
  @Column()
  url!: string;

  // The HMAC signing secret is never serialised back to clients.
  @Exclude()
  @Column()
  secret!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Exclude } from 'class-transformer';
import { Column, Entity } from 'typeorm';

/** A tenant-configured HTTPS destination for signed booking event webhooks. */
@Entity('webhook_endpoints')
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

import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/** A staff member who performs services. Backed by a tenant membership user. */
@Entity('staff')
@Index(['tenantId', 'userId'], { unique: true })
export class Staff extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'display_name' })
  displayName!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

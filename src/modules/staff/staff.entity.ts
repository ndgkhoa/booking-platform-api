import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

@Entity('staff')
@Index(['tenantId', 'userId'], { unique: true, where: '"deleted_at" IS NULL' })
export class Staff extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'display_name' })
  displayName!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

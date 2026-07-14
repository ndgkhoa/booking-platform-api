import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

@Entity('customers')
@Index(['tenantId', 'email'], { unique: true, where: '"deleted_at" IS NULL' })
export class Customer extends BaseTenantEntity {
  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;
}

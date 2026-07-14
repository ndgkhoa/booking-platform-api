import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/** A tenant's customer. Tenant-scoped identity, distinct from platform users. */
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

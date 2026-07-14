import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/** Price is stored as an integer amount in minor units plus an ISO currency, never a float; buffers pad the slot before/after for cleanup or prep. */
@Entity('services')
@Index(['tenantId', 'name'], { unique: true, where: '"deleted_at" IS NULL' })
export class Service extends BaseTenantEntity {
  @Column()
  name!: string;

  @Column({ name: 'duration_min', type: 'int' })
  durationMin!: number;

  @Column({ name: 'price_amount', type: 'int' })
  priceAmount!: number;

  @Column({ name: 'price_currency', type: 'varchar', length: 3, default: 'VND' })
  priceCurrency!: string;

  @Column({ name: 'buffer_before_min', type: 'int', default: 0 })
  bufferBeforeMin!: number;

  @Column({ name: 'buffer_after_min', type: 'int', default: 0 })
  bufferAfterMin!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

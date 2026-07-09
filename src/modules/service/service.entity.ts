import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/**
 * A bookable service offering. Price is stored as an integer amount in minor
 * units (see Money VO) plus an ISO currency — never a float. Buffers pad the
 * slot before/after for cleanup or prep and feed availability (phase-03).
 */
@Entity('services')
@Index(['tenantId', 'name'], { unique: true })
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

import { BaseEntity } from '@common/base/entity.base';
import { Column, Entity, Index } from 'typeorm';

/**
 * A global subscription plan (not tenant-scoped). Entitlement limits are stored
 * as integer caps; `-1` means unlimited. Price is integer minor units.
 */
@Entity('plans')
export class Plan extends BaseEntity {
  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ name: 'price_amount', type: 'int' })
  priceAmount!: number;

  @Column({ name: 'price_currency', type: 'varchar', length: 3, default: 'VND' })
  priceCurrency!: string;

  @Column({ name: 'max_staff', type: 'int', default: -1 })
  maxStaff!: number;

  @Column({ name: 'max_bookings_per_month', type: 'int', default: -1 })
  maxBookingsPerMonth!: number;
}

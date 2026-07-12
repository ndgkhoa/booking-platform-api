import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { BookingStatus } from '@common/types/enums/booking-status';
import { Column, Entity, Index, VersionColumn } from 'typeorm';

/**
 * A booking of a staff member for a service in a time range. Overlap of active
 * bookings per staff is prevented by a Postgres EXCLUDE constraint (migration);
 * `version` powers optimistic locking for reschedule/cancel. Price is snapshotted
 * at booking time so later price changes don't rewrite history.
 */
@Entity('bookings')
@Index(['tenantId', 'staffId', 'startsAt'])
export class Booking extends BaseTenantEntity {
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'varchar', default: BookingStatus.Pending })
  status!: BookingStatus;

  @Column({ name: 'price_amount', type: 'int' })
  priceAmount!: number;

  @Column({ name: 'price_currency', type: 'varchar', length: 3 })
  priceCurrency!: string;

  // Set when this booking is one occurrence of a recurrence series.
  @Column({ name: 'recurrence_id', type: 'uuid', nullable: true })
  recurrenceId?: string | null;

  @VersionColumn()
  version!: number;
}

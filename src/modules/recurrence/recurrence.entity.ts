import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import type { RecurrenceFreq } from '@modules/recurrence/domain/recurrence-expander';
import { Column, Entity } from 'typeorm';

/** Only a generator + linkage; expanded into individual Booking rows still guarded by the EXCLUDE constraint. Timezone is snapshotted so the series stays anchored if the tenant later changes zones. */
@Entity('recurrences')
export class Recurrence extends BaseTenantEntity {
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'varchar' })
  freq!: RecurrenceFreq;

  @Column({ type: 'int' })
  interval!: number;

  @Column({ name: 'weekdays', type: 'int', array: true, nullable: true })
  weekdays?: number[] | null;

  @Column({ name: 'start_date' })
  startDate!: string;

  @Column({ name: 'start_minutes', type: 'int' })
  startMinutes!: number;

  @Column({ type: 'int', nullable: true })
  count?: number | null;

  @Column({ name: 'until', type: 'varchar', nullable: true })
  until?: string | null;

  @Column({ type: 'varchar' })
  timezone!: string;
}

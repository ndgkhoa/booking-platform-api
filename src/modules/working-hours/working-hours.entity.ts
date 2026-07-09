import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/**
 * A recurring weekly work interval for a staff member. Times are minutes from
 * local midnight (0–1440) interpreted in the tenant's timezone (converted to UTC
 * during availability computation). Multiple intervals per weekday are allowed
 * but must not overlap.
 */
@Entity('working_hours')
@Index(['tenantId', 'staffId', 'weekday'])
export class WorkingHours extends BaseTenantEntity {
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @Column({ type: 'smallint' })
  weekday!: number;

  @Column({ name: 'start_min', type: 'smallint' })
  startMin!: number;

  @Column({ name: 'end_min', type: 'smallint' })
  endMin!: number;
}

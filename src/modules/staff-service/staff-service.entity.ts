import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { Column, Entity, Index } from 'typeorm';

/** Capability link: which services a staff member can perform. */
@Entity('staff_services')
@Index(['tenantId', 'staffId', 'serviceId'], { unique: true })
export class StaffService extends BaseTenantEntity {
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;
}

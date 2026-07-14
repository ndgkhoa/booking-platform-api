import { BaseEntity } from '@common/base/entity.base';
import { TenantStatus } from '@common/types';
import { Column, Entity, Index } from 'typeorm';

/** The isolation boundary itself, so it extends BaseEntity, not BaseTenantEntity; timezone is an IANA name used to render tenant-local times from UTC storage. */
@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column()
  name!: string;

  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column({ default: 'UTC' })
  timezone!: string;

  @Column({ type: 'varchar', default: TenantStatus.Active })
  status!: TenantStatus;
}

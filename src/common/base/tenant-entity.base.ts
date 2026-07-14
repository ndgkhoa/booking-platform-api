import { BaseEntity } from '@common/base/entity.base';
import { Column, Index } from 'typeorm';

// Tenant-scoped base; subclasses must lead any natural-key unique index with `tenantId`.
@Index(['tenantId'])
export abstract class BaseTenantEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
}

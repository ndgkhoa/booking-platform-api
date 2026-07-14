import { BaseEntity } from '@common/base/entity.base';
import { Column, Index } from 'typeorm';

/**
 * Base for tenant-scoped rows: adds `tenant_id` plus a leading index on it.
 * Subclasses MUST declare any natural-key unique index scoped by tenant and
 * leading with `tenantId`, e.g. `@Index(['tenantId', 'slug'], { unique: true })`.
 */
@Index(['tenantId'])
export abstract class BaseTenantEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
}

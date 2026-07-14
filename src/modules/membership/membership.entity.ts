import { BaseEntity } from '@common/base/entity.base';
import type { MembershipRole } from '@common/types';
import { Column, Entity, Index } from 'typeorm';

/** Extends BaseEntity, not BaseTenantEntity: queried by user_id at login before any tenant context exists, so its RLS policy is intentionally deferred. */
@Entity('memberships')
@Index(['userId', 'tenantId'], { unique: true })
@Index(['tenantId'])
export class Membership extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar' })
  role!: MembershipRole;
}

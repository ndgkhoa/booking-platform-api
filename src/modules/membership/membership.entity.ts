import { BaseEntity } from '@common/base/entity.base';
import type { MembershipRole } from '@common/types/enums/membership-role';
import { Column, Entity, Index } from 'typeorm';

/**
 * Bridge between a global user and a tenant, carrying the user's role there.
 * Queried by `user_id` at login (before any tenant context exists) to resolve
 * which tenants a user belongs to — hence it extends `BaseEntity`, not
 * `BaseTenantEntity`, and its RLS policy is intentionally deferred.
 */
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

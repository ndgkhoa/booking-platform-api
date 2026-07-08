import { BaseEntity } from '@common/base/base.entity';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import { Column, Entity, Index } from 'typeorm';

/**
 * Join between a global {@link User} and a {@link Tenant}, carrying the user's
 * role within that tenant. A user may have at most one membership per tenant.
 */
@Entity('tenant_members')
@Index(['tenantId', 'userId'], { unique: true })
export class TenantMember extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: TenantRole,
    enumName: 'tenant_member_role',
    default: TenantRole.STAFF,
  })
  role!: TenantRole;

  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt?: Date | null;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt?: Date | null;
}

import { BaseEntity } from '@common/base/entity.base';
import { PlatformRole } from '@modules/user/platform-role.enum';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';

/**
 * Global user identity. A user is not owned by any tenant — roles and tenant
 * membership live on TenantMember, so the same account can belong to several
 * tenants with different roles.
 */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column()
  email!: string;

  @Column()
  name!: string;

  @Exclude()
  @Column({ name: 'password_hash' })
  passwordHash!: string;

  /** Platform-level role (null for ordinary users) — grants `/admin` access. */
  @Column({
    name: 'platform_role',
    type: 'enum',
    enum: PlatformRole,
    enumName: 'platform_role',
    nullable: true,
  })
  platformRole?: PlatformRole | null;
}

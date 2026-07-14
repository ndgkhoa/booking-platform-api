import { BaseEntity } from '@common/base/entity.base';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column()
  email!: string;

  @Column()
  name!: string;

  // Nullable: users who sign in only through an OAuth provider have no password.
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash!: string | null;

  // OAuth identity (e.g. 'google' + the provider's stable subject id). Both null
  // for password-only accounts; unique together so one identity maps to one user.
  @Column({ type: 'varchar', nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_account_id', type: 'varchar', nullable: true })
  providerAccountId!: string | null;

  // Global platform administrator. Tenant-scoped roles live in `memberships`.
  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin!: boolean;
}

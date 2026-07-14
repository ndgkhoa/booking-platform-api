import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import type { MembershipRole } from '@common/types';
import { Column, Entity, Index } from 'typeorm';

/**
 * A single-use, expiring invitation binding an email to a role in a tenant.
 * Only the SHA-256 `token_hash` is stored; the plaintext lives only in the email
 * link. `accepted_at` marks redemption (claimed atomically to prevent reuse).
 */
@Entity('invites')
export class Invite extends BaseTenantEntity {
  @Column()
  email!: string;

  @Column({ type: 'varchar' })
  role!: MembershipRole;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;
}

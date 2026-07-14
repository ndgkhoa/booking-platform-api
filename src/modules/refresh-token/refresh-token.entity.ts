import { BaseEntity } from '@common/base/entity.base';
import type { MembershipRole } from '@common/types';
import { Column, Entity, Index } from 'typeorm';

/** Tokens form a family (one login chain); each rotation marks the old row used and issues a successor. Presenting an already-used token indicates theft, revoking the whole family. */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  role?: MembershipRole | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;
}

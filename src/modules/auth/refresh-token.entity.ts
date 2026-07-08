import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, Index } from 'typeorm';

/**
 * A single issued refresh token, stored only as a SHA-256 hash. Tokens are
 * grouped by `familyId`: rotating a token revokes the old row and issues a new
 * one in the same family; presenting an already-revoked token (theft replay)
 * revokes the whole family.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Index()
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy?: string | null;
}

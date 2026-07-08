import { randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@common/exceptions';
import { sha256 } from '@common/utils/hash';
import { env } from '@config/env';
import { RefreshTokenRepository } from '@modules/auth/refresh-token.repository';
import type { MembershipRole } from '@modules/membership/membership.entity';
import { Service } from 'typedi';

export interface SessionScope {
  tenantId?: string;
  role?: MembershipRole;
}

export interface RotatedSession extends SessionScope {
  userId: string;
  refreshToken: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Service()
export class RefreshTokenService {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  /** Mints a refresh token; `familyId` continues an existing chain (rotation). */
  async issue(userId: string, scope: SessionScope, familyId?: string): Promise<string> {
    const plaintext = randomBytes(32).toString('hex');
    await this.tokens.create({
      userId,
      familyId: familyId ?? randomUUID(),
      tokenHash: sha256(plaintext),
      tenantId: scope.tenantId ?? null,
      role: scope.role ?? null,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });
    return plaintext;
  }

  /** Validates + rotates a refresh token, with theft detection on reuse. */
  async rotate(plaintext: string): Promise<RotatedSession> {
    const record = await this.tokens.findByHash(sha256(plaintext));
    if (!record || record.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.usedAt) {
      // A rotated token presented again ⇒ likely stolen — burn the whole family.
      await this.tokens.revokeFamily(record.familyId, new Date());
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.tokens.markUsed(record.id, new Date());
    const scope: SessionScope = {
      tenantId: record.tenantId ?? undefined,
      role: record.role ?? undefined,
    };
    const refreshToken = await this.issue(record.userId, scope, record.familyId);
    return { userId: record.userId, ...scope, refreshToken };
  }

  /** Revokes the token's whole family (logout). No-op if the token is unknown. */
  async revoke(plaintext: string): Promise<void> {
    const record = await this.tokens.findByHash(sha256(plaintext));
    if (record) {
      await this.tokens.revokeFamily(record.familyId, new Date());
    }
  }
}

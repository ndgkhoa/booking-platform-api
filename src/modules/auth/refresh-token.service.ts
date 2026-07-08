import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@common/exceptions';
import { RefreshTokenRepository } from '@modules/auth/refresh-token.repository';
import { Service } from 'typedi';
import { DataSource, type EntityManager } from 'typeorm';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RotatedRefresh {
  userId: string;
  tenantId: string;
  newToken: string;
}

/**
 * Issues and rotates opaque refresh tokens with theft (reuse) detection. Only a
 * SHA-256 hash of each token is persisted; the plaintext exists solely in the
 * client's possession.
 */
@Service()
export class RefreshTokenService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: RefreshTokenRepository,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Persist a fresh token row and return the plaintext (caller keeps it) + id. */
  private async mint(
    userId: string,
    tenantId: string,
    familyId: string,
    manager?: EntityManager,
  ): Promise<{ token: string; id: string }> {
    const token = randomBytes(32).toString('hex');
    const row = await this.tokens.insert(
      {
        userId,
        tenantId,
        tokenHash: this.hash(token),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
      manager,
    );
    return { token, id: row.id };
  }

  /** Mint a new refresh token, optionally continuing an existing family. */
  async issue(
    userId: string,
    tenantId: string,
    familyId: string = randomUUID(),
    manager?: EntityManager,
  ): Promise<string> {
    const { token } = await this.mint(userId, tenantId, familyId, manager);
    return token;
  }

  /**
   * Validate a presented refresh token and rotate it. Replaying an already
   * revoked token (theft) revokes the whole family. The rotation itself runs in
   * a transaction and claims the old row with a conditional
   * `WHERE revoked_at IS NULL`, so if two requests race the same token only one
   * wins — the loser is also treated as theft. Family revocation is committed
   * outside the rotation transaction so a subsequent rejection can't roll it back.
   */
  async rotate(token: string): Promise<RotatedRefresh> {
    const record = await this.tokens.findByHash(this.hash(token));
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      await this.tokens.revokeActiveInFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Atomic claim: only the request that flips revoked_at may issue a successor.
        const won = await this.tokens.claim(record.id, manager);
        if (!won) {
          throw new ConcurrentRotationError(record.familyId);
        }
        const replacement = await this.mint(
          record.userId,
          record.tenantId,
          record.familyId,
          manager,
        );
        await this.tokens.setReplacedBy(record.id, replacement.id, manager);
        return { userId: record.userId, tenantId: record.tenantId, newToken: replacement.token };
      });
    } catch (error) {
      if (error instanceof ConcurrentRotationError) {
        await this.tokens.revokeActiveInFamily(error.familyId);
        throw new UnauthorizedException('Refresh token reuse detected');
      }
      throw error;
    }
  }
}

/** Internal signal: another request revoked this token first (lost the race). */
class ConcurrentRotationError extends Error {
  constructor(readonly familyId: string) {
    super('Concurrent refresh rotation');
  }
}

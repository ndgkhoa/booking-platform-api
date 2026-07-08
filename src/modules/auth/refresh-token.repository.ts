import { RefreshToken } from '@modules/auth/refresh-token.entity';
import { Service } from 'typedi';
import { DataSource, type EntityManager, IsNull, type Repository } from 'typeorm';

export interface NewRefreshToken {
  userId: string;
  tenantId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Data access for refresh tokens. Every method accepts an optional
 * EntityManager so callers can enlist the operation in an ongoing transaction
 * (used by rotation and by atomic signup).
 */
@Service()
export class RefreshTokenRepository {
  private readonly repo: Repository<RefreshToken>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(RefreshToken);
  }

  private scoped(manager?: EntityManager): Repository<RefreshToken> {
    return manager ? manager.getRepository(RefreshToken) : this.repo;
  }

  insert(data: NewRefreshToken, manager?: EntityManager): Promise<RefreshToken> {
    const repo = this.scoped(manager);
    return repo.save(repo.create(data));
  }

  findByHash(tokenHash: string, manager?: EntityManager): Promise<RefreshToken | null> {
    return this.scoped(manager).findOne({ where: { tokenHash } });
  }

  /** Atomically revoke one active token. Returns true only if this call won. */
  async claim(id: string, manager?: EntityManager): Promise<boolean> {
    const result = await this.scoped(manager).update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected === 1;
  }

  /** Revoke every still-active token in a family (theft response). */
  async revokeActiveInFamily(familyId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async setReplacedBy(id: string, replacementId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).update(id, { replacedBy: replacementId });
  }
}

import { RefreshToken } from '@modules/auth/refresh-token.entity';
import { Service } from 'typedi';
import { DataSource, IsNull, type Repository } from 'typeorm';

@Service()
export class RefreshTokenRepository {
  private readonly repo: Repository<RefreshToken>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(RefreshToken);
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  create(data: Partial<RefreshToken>): Promise<RefreshToken> {
    return this.repo.save(this.repo.create(data));
  }

  /**
   * Atomically claims an unused token. Returns false if it was already used —
   * the guard against a rotation race / replay (only one caller can win).
   */
  async markUsedIfUnused(id: string, usedAt: Date): Promise<boolean> {
    const result = await this.repo.update({ id, usedAt: IsNull() }, { usedAt });
    return (result.affected ?? 0) > 0;
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.repo.update({ familyId, revokedAt: IsNull() }, { revokedAt });
  }
}

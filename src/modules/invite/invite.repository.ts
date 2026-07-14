import { Invite } from '@modules/invite/invite.entity';
import { Service } from 'typedi';
import { DataSource, IsNull, type Repository } from 'typeorm';

@Service()
export class InviteRepository {
  private readonly repo: Repository<Invite>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Invite);
  }

  create(data: Partial<Invite>): Promise<Invite> {
    return this.repo.save(this.repo.create(data));
  }

  // Accept is a cross-tenant lookup by the unique token — the token IS the scope.
  findByHash(tokenHash: string): Promise<Invite | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  /** Atomically claims a pending invite; false if it was already accepted. */
  async markAcceptedIfPending(id: string, acceptedAt: Date): Promise<boolean> {
    const result = await this.repo.update({ id, acceptedAt: IsNull() }, { acceptedAt });
    return (result.affected ?? 0) > 0;
  }
}

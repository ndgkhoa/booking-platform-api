import { Membership } from '@modules/membership/membership.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

@Service()
export class MembershipRepository {
  private readonly repo: Repository<Membership>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Membership);
  }

  findByUser(userId: string): Promise<Membership[]> {
    return this.repo.find({ where: { userId } });
  }

  findByUserAndTenant(userId: string, tenantId: string): Promise<Membership | null> {
    return this.repo.findOne({ where: { userId, tenantId } });
  }

  create(data: Partial<Membership>): Promise<Membership> {
    return this.repo.save(this.repo.create(data));
  }
}

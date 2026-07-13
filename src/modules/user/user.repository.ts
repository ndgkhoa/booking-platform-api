import type { UserQueryDto } from '@modules/user/dto/user-query.dto';
import { User } from '@modules/user/user.entity';
import { Service } from 'typedi';
import { DataSource, type FindOptionsWhere, ILike, type Repository } from 'typeorm';

@Service()
export class UserRepository {
  private readonly repo: Repository<User>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(User);
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findByProviderAccount(provider: string, providerAccountId: string): Promise<User | null> {
    return this.repo.findOne({ where: { provider, providerAccountId } });
  }

  create(data: Partial<User>): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  async linkProvider(id: string, provider: string, providerAccountId: string): Promise<void> {
    await this.repo.update(id, { provider, providerAccountId });
  }

  paginate(query: UserQueryDto): Promise<[User[], number]> {
    const where: FindOptionsWhere<User> = {};
    if (query.name) where.name = ILike(`%${query.name}%`);
    if (query.email) where.email = ILike(`%${query.email}%`);

    return this.repo.findAndCount({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      order: { createdAt: 'DESC' },
    });
  }
}

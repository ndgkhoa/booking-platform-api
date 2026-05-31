import { User } from '@modules/user/user.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

/**
 * Data-access boundary for the User entity. ALL TypeORM queries live here — the
 * service layer depends only on this class and never touches the EntityManager
 * or QueryBuilder directly. Receives the shared DataSource via TypeDI.
 */
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

  create(data: Partial<User>): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  /** Returns a page of users plus the total count, newest first. */
  paginate(page: number, limit: number): Promise<[User[], number]> {
    return this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }
}

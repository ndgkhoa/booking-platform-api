import type { UserQuery } from '@modules/user/dto/query.dto';
import { User } from '@modules/user/user.entity';
import { Service } from 'typedi';
import { DataSource, type Repository, type SelectQueryBuilder } from 'typeorm';

@Service()
export class UserRepository {
  private readonly repo: Repository<User>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(User);
  }

  /** Global lookup by id — used by auth flows that resolve a user pre-context. */
  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Global lookup by email — used by login/register (email is unique). */
  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  /** A user, only if they are an active member of the given tenant (else null). */
  findByIdInTenant(id: string, tenantId: string): Promise<User | null> {
    return this.membersOf(tenantId).andWhere('u.id = :id', { id }).getOne();
  }

  /** Paginated list of the tenant's active members, with optional name/email filter. */
  paginateInTenant(tenantId: string, query: UserQuery): Promise<[User[], number]> {
    const qb = this.membersOf(tenantId);
    if (query.name) qb.andWhere('u.name ILIKE :name', { name: `%${query.name}%` });
    if (query.email) qb.andWhere('u.email ILIKE :email', { email: `%${query.email}%` });

    return qb
      .orderBy('u.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  /**
   * Query builder joining users to the *active* memberships of one tenant.
   * TypeORM auto-appends `m.deleted_at IS NULL`, so removed members drop out.
   */
  private membersOf(tenantId: string): SelectQueryBuilder<User> {
    return this.repo
      .createQueryBuilder('u')
      .innerJoin('tenant_members', 'm', 'm.user_id = u.id AND m.tenant_id = :tenantId', {
        tenantId,
      });
  }
}

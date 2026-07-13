import { NotFoundException } from '@common/exceptions';
import { type ApiResponse, paginated } from '@common/types';
import type { UserQueryDto } from '@modules/user/dto/user-query.dto';
import type { User } from '@modules/user/user.entity';
import { UserRepository } from '@modules/user/user.repository';
import { Service } from 'typedi';

@Service()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(email);
  }

  findByProviderAccount(provider: string, providerAccountId: string): Promise<User | null> {
    return this.users.findByProviderAccount(provider, providerAccountId);
  }

  create(
    data: Pick<User, 'email' | 'name'> &
      Partial<Pick<User, 'passwordHash' | 'provider' | 'providerAccountId'>>,
  ): Promise<User> {
    return this.users.create(data);
  }

  linkProvider(id: string, provider: string, providerAccountId: string): Promise<void> {
    return this.users.linkProvider(id, provider, providerAccountId);
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async list(query: UserQueryDto): Promise<ApiResponse<User[]>> {
    const [items, total] = await this.users.paginate(query);
    return paginated(items, query.page, query.limit, total);
  }
}

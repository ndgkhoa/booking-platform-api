import { NotFoundException } from '@common/exceptions';
import { type ApiResponse, paginated } from '@common/types/response';
import type { UserQuery } from '@modules/user/dto/user-query.dto';
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

  create(data: Pick<User, 'email' | 'name' | 'passwordHash'>): Promise<User> {
    return this.users.create(data);
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async list(query: UserQuery): Promise<ApiResponse<User[]>> {
    const [items, total] = await this.users.paginate(query);
    return paginated(items, query.page, query.limit, total);
  }
}

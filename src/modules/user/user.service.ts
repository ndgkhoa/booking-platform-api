import { NotFoundException } from '@common/exceptions';
import { type ApiResponse, paginated } from '@common/types/api-response';
import type { User } from '@modules/user/user.entity';
import { UserRepository } from '@modules/user/user.repository';
import { Service } from 'typedi';

/** User read use-cases. All persistence is delegated to UserRepository. */
@Service()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /** Returns a pre-enveloped, paginated list (passes through ResponseInterceptor). */
  async list(page: number, limit: number): Promise<ApiResponse<User[]>> {
    const [items, total] = await this.users.paginate(page, limit);
    return paginated(items, page, limit, total);
  }
}

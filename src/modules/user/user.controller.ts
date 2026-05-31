import type { User } from '@modules/user/user.entity';
import { UserService } from '@modules/user/user.service';
import {
  Authorized,
  CurrentUser,
  Get,
  JsonController,
  Param,
  QueryParam,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  /** Current authenticated user (any role). */
  @Get('/me')
  @Authorized()
  me(@CurrentUser({ required: true }) user: User): User {
    return user;
  }

  /** Paginated user list — admin only. */
  @Get()
  @Authorized(['admin'])
  list(@QueryParam('page') page = 1, @QueryParam('limit') limit = 20) {
    return this.users.list(page, limit);
  }

  @Get('/:id')
  @Authorized()
  byId(@Param('id') id: string): Promise<User> {
    return this.users.getByIdOrFail(id);
  }
}

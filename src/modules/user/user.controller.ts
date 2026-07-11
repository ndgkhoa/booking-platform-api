import { SUPER_ADMIN_ONLY } from '@modules/auth/roles';
import { UserQueryDto } from '@modules/user/dto/user-query.dto';
import type { User } from '@modules/user/user.entity';
import { UserService } from '@modules/user/user.service';
import {
  Authorized,
  CurrentUser,
  Get,
  JsonController,
  Param,
  QueryParams,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('/me')
  @Authorized()
  me(@CurrentUser({ required: true }) user: User): User {
    return user;
  }

  @Get()
  @Authorized(SUPER_ADMIN_ONLY)
  list(@QueryParams() query: UserQueryDto) {
    return this.users.list(query);
  }

  @Get('/:id')
  @Authorized()
  byId(@Param('id') id: string): Promise<User> {
    return this.users.getById(id);
  }
}

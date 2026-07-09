import { ListUsersDto } from '@modules/user/dto/list-users.dto';
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
  @Authorized(['super_admin'])
  list(@QueryParams() query: ListUsersDto) {
    return this.users.list(query);
  }

  @Get('/:id')
  @Authorized()
  byId(@Param('id') id: string): Promise<User> {
    return this.users.getById(id);
  }
}

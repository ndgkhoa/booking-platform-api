import { UserQuery } from '@modules/user/dto/query.dto';
import type { User } from '@modules/user/user.entity';
import { UserService } from '@modules/user/user.service';
import {
  Authorized,
  CurrentUser,
  Delete,
  Get,
  JsonController,
  OnUndefined,
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
  @Authorized(['admin'])
  list(@QueryParams() query: UserQuery) {
    return this.users.list(query);
  }

  @Get('/:id')
  @Authorized()
  byId(@Param('id') id: string): Promise<User> {
    return this.users.getById(id);
  }

  @Delete('/:id')
  @Authorized(['admin'])
  @OnUndefined(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.users.delete(id);
  }
}

import { TenantRole } from '@modules/tenant/tenant-role.enum';
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
import { OpenAPI } from 'routing-controllers-openapi';
import { Service } from 'typedi';

@Service()
@JsonController('/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('/me')
  @Authorized()
  @OpenAPI({
    summary: 'Current user',
    description: 'The authenticated user behind the access token.',
  })
  me(@CurrentUser({ required: true }) user: User): User {
    return user;
  }

  @Get()
  @Authorized([TenantRole.OWNER])
  @OpenAPI({
    summary: 'List members',
    description:
      "Paginated list of the caller's tenant members. Owner role required; supports name/email filters.",
  })
  list(@QueryParams() query: UserQuery) {
    return this.users.list(query);
  }

  @Get('/:id')
  @Authorized()
  @OpenAPI({
    summary: 'Get a member',
    description: "A member of the caller's tenant. Unknown or out-of-tenant id returns 404.",
  })
  byId(@Param('id') id: string): Promise<User> {
    return this.users.getById(id);
  }

  @Delete('/:id')
  @Authorized([TenantRole.OWNER])
  @OnUndefined(204)
  @OpenAPI({
    summary: 'Remove a member',
    description:
      "Remove a user from the caller's tenant (the global account is untouched). Owner role required.",
  })
  remove(@Param('id') id: string): Promise<void> {
    return this.users.delete(id);
  }
}

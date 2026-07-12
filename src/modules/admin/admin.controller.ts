import { AdminService } from '@modules/admin/admin.service';
import { SuspendTenantDto } from '@modules/admin/dto/suspend-tenant.dto';
import { SUPER_ADMIN_ONLY } from '@modules/auth/roles';
import { User } from '@modules/user/user.entity';
import {
  Authorized,
  Body,
  CurrentUser,
  Get,
  JsonController,
  Param,
  Post,
} from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Super-admin platform console. Class-level `@Authorized(SUPER_ADMIN_ONLY)` gates
 * every route to the global platform flag (`users.is_super_admin`); no tenant
 * membership grants access.
 */
@Service()
@JsonController('/admin')
@Authorized(SUPER_ADMIN_ONLY)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('/tenants')
  listTenants() {
    return this.admin.listTenants();
  }

  @Get('/tenants/:id')
  tenantDetail(@CurrentUser({ required: true }) user: User, @Param('id') id: string) {
    return this.admin.getTenantDetail(user.id, id);
  }

  @Post('/tenants/:id/suspend')
  suspend(
    @CurrentUser({ required: true }) user: User,
    @Param('id') id: string,
    @Body() dto: SuspendTenantDto,
  ) {
    return this.admin.suspend(user.id, id, dto.reason);
  }

  @Post('/tenants/:id/reactivate')
  reactivate(@CurrentUser({ required: true }) user: User, @Param('id') id: string) {
    return this.admin.reactivate(user.id, id);
  }
}

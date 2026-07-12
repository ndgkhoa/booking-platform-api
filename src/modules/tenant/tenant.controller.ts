import { MembershipRole } from '@common/types';
import { AuthService } from '@modules/auth/auth.service';
import { CreateTenantDto } from '@modules/tenant/dto/create-tenant.dto';
import { TenantService } from '@modules/tenant/tenant.service';
import type { User } from '@modules/user/user.entity';
import { Authorized, Body, CurrentUser, HttpCode, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/tenants')
export class TenantController {
  constructor(
    private readonly tenants: TenantService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Onboarding: any authenticated user creates a tenant and becomes its owner.
   * Returns a fresh access + refresh pair scoped to the new tenant (the caller's
   * old session has no tenant claim).
   */
  @Post()
  @HttpCode(201)
  @Authorized()
  async create(@CurrentUser({ required: true }) user: User, @Body() dto: CreateTenantDto) {
    const tenant = await this.tenants.onboard(user.id, dto);
    const session = await this.auth.startTenantSession(user.id, tenant.id, MembershipRole.Owner);
    return { tenant, ...session };
  }
}

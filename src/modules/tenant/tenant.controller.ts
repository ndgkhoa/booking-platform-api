import { TokenService } from '@modules/auth/token.service';
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
    private readonly tokens: TokenService,
  ) {}

  /**
   * Onboarding: any authenticated user creates a tenant and becomes its owner.
   * Returns a fresh token scoped to the new tenant (the caller's old token has
   * no tenant claim).
   */
  @Post()
  @HttpCode(201)
  @Authorized()
  async create(@CurrentUser({ required: true }) user: User, @Body() dto: CreateTenantDto) {
    const tenant = await this.tenants.onboard(user.id, dto);
    const token = this.tokens.sign({ sub: user.id, tenantId: tenant.id, role: 'owner' });
    return { tenant, token };
  }
}

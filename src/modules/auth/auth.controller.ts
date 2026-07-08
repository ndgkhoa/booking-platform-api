import { AuthService } from '@modules/auth/auth.service';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RefreshTokenDto } from '@modules/auth/dto/refresh-token.dto';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { SwitchTenantDto } from '@modules/auth/dto/switch-tenant.dto';
import type { User } from '@modules/user/user.entity';
import { Authorized, Body, CurrentUser, HttpCode, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('/register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('/switch-tenant')
  @Authorized()
  switchTenant(@CurrentUser({ required: true }) user: User, @Body() dto: SwitchTenantDto) {
    return this.auth.switchTenant(user, dto.tenantId);
  }

  @Post('/refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('/logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refreshToken);
    return { success: true };
  }
}

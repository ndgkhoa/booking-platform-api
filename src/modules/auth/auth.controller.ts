import { AuthService } from '@modules/auth/auth.service';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RefreshDto } from '@modules/auth/dto/refresh.dto';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { Body, HttpCode, JsonController, Post } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { Service } from 'typedi';

@Service()
@JsonController('/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('/register')
  @HttpCode(201)
  @OpenAPI({
    summary: 'Sign up',
    description:
      'Create a user, their tenant, and the owner membership atomically. Returns the user plus an access token and a rotating refresh token.',
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('/login')
  @OpenAPI({
    summary: 'Log in',
    description: 'Exchange email + password for a fresh access token and refresh token.',
  })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('/refresh')
  @OpenAPI({
    summary: 'Rotate refresh token',
    description:
      'Exchange a refresh token for a new access + refresh pair. Replaying an already-rotated token is treated as theft and revokes the whole token family.',
  })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

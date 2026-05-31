import { AuthService } from '@modules/auth/auth.service';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { Body, HttpCode, JsonController, Post } from 'routing-controllers';
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
}

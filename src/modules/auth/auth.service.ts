import { ConflictException, UnauthorizedException } from '@common/exceptions';
import type { LoginDto } from '@modules/auth/dto/login.dto';
import type { RegisterDto } from '@modules/auth/dto/register.dto';
import { TokenService } from '@modules/auth/token.service';
import type { User } from '@modules/user/user.entity';
import { UserRepository } from '@modules/user/user.repository';
import bcrypt from 'bcryptjs';
import { Service } from 'typedi';

const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  user: User;
  token: string;
}

@Service()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      roles: ['user'],
    });
    return { user, token: this.tokens.sign(user) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { user, token: this.tokens.sign(user) };
  }
}

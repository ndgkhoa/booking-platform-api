import { ConflictException, UnauthorizedException } from '@common/exceptions';
import type { LoginDto } from '@modules/auth/dto/login.dto';
import type { RegisterDto } from '@modules/auth/dto/register.dto';
import { TokenService } from '@modules/auth/token.service';
import { MembershipService } from '@modules/membership/membership.service';
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
    private readonly memberships: MembershipService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    // No tenant yet — the token carries only identity until onboarding/invite.
    return { user, token: this.tokens.sign({ sub: user.id }) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { user, token: await this.issueToken(user) };
  }

  async switchTenant(user: User, tenantId: string): Promise<AuthResult> {
    const role = await this.memberships.resolveRole(user.id, tenantId);
    if (!role && !user.isSuperAdmin) {
      throw new UnauthorizedException('Not a member of this tenant');
    }
    return {
      user,
      token: this.tokens.sign({ sub: user.id, tenantId, role: role ?? undefined }),
    };
  }

  /** Signs a token scoped to the user's primary membership, if any. */
  private async issueToken(user: User): Promise<string> {
    const [primary] = await this.memberships.listForUser(user.id);
    return this.tokens.sign(
      primary ? { sub: user.id, tenantId: primary.tenantId, role: primary.role } : { sub: user.id },
    );
  }
}

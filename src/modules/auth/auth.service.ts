import { ConflictException, UnauthorizedException } from '@common/exceptions';
import type { LoginDto } from '@modules/auth/dto/login.dto';
import type { RegisterDto } from '@modules/auth/dto/register.dto';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { TokenService } from '@modules/auth/token.service';
import { Role } from '@modules/tenant/role.enum';
import { TenantService } from '@modules/tenant/tenant.service';
import { TenantMemberRepository } from '@modules/tenant/tenant-member.repository';
import { User } from '@modules/user/user.entity';
import { UserRepository } from '@modules/user/user.repository';
import bcrypt from 'bcryptjs';
import { Service } from 'typedi';
import { DataSource, type EntityManager, QueryFailedError } from 'typeorm';

const BCRYPT_ROUNDS = 12;
const PG_UNIQUE_VIOLATION = '23505';

/** True when the error is a Postgres unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}

export interface AuthResult {
  user: User;
  /** Short-lived access token (JWT). */
  token: string;
  /** Long-lived rotating refresh token (opaque). */
  refreshToken: string;
}

@Service()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly members: TenantMemberRepository,
    private readonly tenants: TenantService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Signup: create the user, their tenant, the owner membership, and the first
   * refresh token — all in one transaction, so a partial failure leaves nothing
   * behind. A concurrent signup with the same email surfaces as 409, not 500.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const user = await userRepo.save(
          userRepo.create({ email: dto.email, name: dto.name, passwordHash }),
        );
        const tenant = await this.tenants.createWithOwner(manager, {
          userId: user.id,
          ownerName: dto.name,
        });
        return this.issueTokens(user, tenant.id, Role.OWNER, manager);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const member = await this.members.findPrimaryForUser(user.id);
    if (!member) {
      throw new UnauthorizedException('No active tenant membership');
    }
    return this.issueTokens(user, member.tenantId, member.role);
  }

  /** Rotate a refresh token and mint a fresh access token for the same tenant. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const member = await this.members.findForUserAndTenant(rotated.userId, rotated.tenantId);
    if (!member) {
      throw new UnauthorizedException('Tenant membership no longer exists');
    }
    const token = this.tokens.signAccess({
      sub: user.id,
      tenantId: rotated.tenantId,
      role: member.role,
    });
    return { user, token, refreshToken: rotated.newToken };
  }

  private async issueTokens(
    user: User,
    tenantId: string,
    role: Role,
    manager?: EntityManager,
  ): Promise<AuthResult> {
    const token = this.tokens.signAccess({ sub: user.id, tenantId, role });
    const refreshToken = await this.refreshTokens.issue(user.id, tenantId, undefined, manager);
    return { user, token, refreshToken };
  }
}

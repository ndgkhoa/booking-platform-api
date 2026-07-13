import { BCRYPT_ROUNDS } from '@common/constants';
import { ConflictException, UnauthorizedException } from '@common/exceptions';
import type { MembershipRole } from '@common/types';
import type { LoginDto } from '@modules/auth/dto/login.dto';
import type { RegisterDto } from '@modules/auth/dto/register.dto';
import { TokenService } from '@modules/auth/token.service';
import { MembershipService } from '@modules/membership/membership.service';
import {
  RefreshTokenService,
  type SessionScope,
} from '@modules/refresh-token/refresh-token.service';
import type { User } from '@modules/user/user.entity';
import { UserService } from '@modules/user/user.service';
import bcrypt from 'bcryptjs';
import { Service } from 'typedi';

export interface SessionTokens {
  token: string;
  refreshToken: string;
}

export interface AuthResult extends SessionTokens {
  user: User;
}

/** Normalised Google identity extracted from a verified OAuth profile. */
export interface GoogleIdentity {
  sub: string; // Google's stable account id
  email: string;
  emailVerified: boolean;
  name: string;
}

@Service()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly memberships: MembershipService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    // No tenant yet — the session carries only identity until onboarding/invite.
    return { user, ...(await this.issueSession(user.id, {})) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    // `passwordHash` is null for OAuth-only accounts — they can't password-login.
    if (!user || !user.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSessionFor(user);
  }

  /**
   * Resolves (or provisions) the user behind a Google identity already verified by
   * the OAuth strategy. A verified Google email is trusted to link onto an existing
   * password account with the same address; unverified emails are refused so an
   * address can't be claimed by someone who doesn't control it. Returns the user
   * without a session — the caller mints one via `issueSessionFor`.
   */
  async resolveGoogleUser(identity: GoogleIdentity): Promise<User> {
    if (!identity.emailVerified) {
      throw new UnauthorizedException('Google account email is not verified');
    }
    const linked = await this.users.findByProviderAccount('google', identity.sub);
    if (linked) {
      return linked;
    }
    const existing = await this.users.findByEmail(identity.email);
    if (existing) {
      await this.users.linkProvider(existing.id, 'google', identity.sub);
      return existing;
    }
    // No tenant yet — same as password signup; onboarding/invite grants one.
    return this.users.create({
      email: identity.email,
      name: identity.name,
      provider: 'google',
      providerAccountId: identity.sub,
    });
  }

  async switchTenant(user: User, tenantId: string): Promise<AuthResult> {
    const role = await this.memberships.resolveRole(user.id, tenantId);
    if (!role && !user.isSuperAdmin) {
      throw new UnauthorizedException('Not a member of this tenant');
    }
    return { user, ...(await this.issueSession(user.id, { tenantId, role: role ?? undefined })) };
  }

  /** Public session mint for callers that already established the scope (onboarding). */
  startTenantSession(
    userId: string,
    tenantId: string,
    role: MembershipRole,
  ): Promise<SessionTokens> {
    return this.issueSession(userId, { tenantId, role });
  }

  /**
   * Rotates the refresh token. Live authority is re-resolved from membership so a
   * removed/downgraded member cannot keep minting old-privilege access tokens for
   * the refresh window — the family is burned if the membership is gone.
   */
  async refresh(refreshToken: string): Promise<SessionTokens> {
    const claimed = await this.refreshTokens.claim(refreshToken);

    let scope: SessionScope = {};
    if (claimed.tenantId) {
      const role = await this.memberships.resolveRole(claimed.userId, claimed.tenantId);
      if (!role) {
        await this.refreshTokens.revokeFamily(claimed.familyId);
        throw new UnauthorizedException('Membership no longer valid');
      }
      scope = { tenantId: claimed.tenantId, role };
    }

    const token = this.tokens.sign({
      sub: claimed.userId,
      tenantId: scope.tenantId,
      role: scope.role,
    });
    const nextRefresh = await this.refreshTokens.issue(claimed.userId, scope, claimed.familyId);
    return { token, refreshToken: nextRefresh };
  }

  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revoke(refreshToken);
  }

  /** Issues a session scoped to the user's primary tenant (identity-only if none). */
  async issueSessionFor(user: User): Promise<AuthResult> {
    const [primary] = await this.memberships.listForUser(user.id);
    const scope: SessionScope = primary ? { tenantId: primary.tenantId, role: primary.role } : {};
    return { user, ...(await this.issueSession(user.id, scope)) };
  }

  private async issueSession(userId: string, scope: SessionScope): Promise<SessionTokens> {
    const token = this.tokens.sign({ sub: userId, tenantId: scope.tenantId, role: scope.role });
    const refreshToken = await this.refreshTokens.issue(userId, scope);
    return { token, refreshToken };
  }
}

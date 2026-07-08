import { UnauthorizedException } from '@common/exceptions';
import { AuthService } from '@modules/auth/auth.service';
import type { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { TokenService } from '@modules/auth/token.service';
import type { TenantService } from '@modules/tenant/tenant.service';
import type { TenantMember } from '@modules/tenant/tenant-member.entity';
import type { TenantMemberRepository } from '@modules/tenant/tenant-member.repository';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import type { User } from '@modules/user/user.entity';
import type { UserRepository } from '@modules/user/user.repository';
import bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UserRepository, 'findByEmail' | 'findById'>>;
  let members: jest.Mocked<Pick<TenantMemberRepository, 'findPrimaryForUser'>>;
  let refreshTokens: jest.Mocked<Pick<RefreshTokenService, 'issue'>>;
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 12);
  });

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findById: jest.fn() };
    members = { findPrimaryForUser: jest.fn() };
    refreshTokens = { issue: jest.fn().mockResolvedValue('refresh-token') };
    service = new AuthService(
      users as unknown as UserRepository,
      members as unknown as TenantMemberRepository,
      {} as TenantService,
      new TokenService(),
      refreshTokens as unknown as RefreshTokenService,
      {} as DataSource,
    );
  });

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({ id: 'u-1', email: 'a@b.com', name: 'A', passwordHash, ...overrides }) as User;

  const makeMember = (overrides: Partial<TenantMember> = {}): TenantMember =>
    ({ tenantId: 't-1', userId: 'u-1', role: TenantRole.OWNER, ...overrides }) as TenantMember;

  describe('login', () => {
    it('returns an access + refresh token pair for the primary membership', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      members.findPrimaryForUser.mockResolvedValue(makeMember());

      const result = await service.login({ email: 'a@b.com', password: 'password123' });

      expect(typeof result.token).toBe('string');
      expect(result.refreshToken).toBe('refresh-token');
      expect(refreshTokens.issue).toHaveBeenCalledWith('u-1', 't-1', undefined, undefined);
      const decoded = new TokenService().verifyAccess(result.token);
      expect(decoded).toMatchObject({ sub: 'u-1', tenantId: 't-1', role: TenantRole.OWNER });
    });

    it('throws UnauthorizedException on wrong password', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'missing@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user has no tenant membership', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      members.findPrimaryForUser.mockResolvedValue(null);
      await expect(
        service.login({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

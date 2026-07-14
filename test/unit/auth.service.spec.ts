import { ConflictException, UnauthorizedException } from '@common/exceptions';
import { AuthService, type GoogleIdentity } from '@modules/auth/auth.service';
import { TokenService } from '@modules/auth/token.service';
import type { MembershipService } from '@modules/membership/membership.service';
import type { RefreshTokenService } from '@modules/refresh-token/refresh-token.service';
import type { User } from '@modules/user/user.entity';
import type { UserService } from '@modules/user/user.service';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let repo: jest.Mocked<
    Pick<UserService, 'findByEmail' | 'findByProviderAccount' | 'create' | 'linkProvider'>
  >;
  let memberships: jest.Mocked<Pick<MembershipService, 'listForUser' | 'resolveRole'>>;
  let refreshTokens: jest.Mocked<Pick<RefreshTokenService, 'issue' | 'claim' | 'revoke'>>;
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 12);
  });

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn(),
      findByProviderAccount: jest.fn(),
      create: jest.fn(),
      linkProvider: jest.fn(),
    };
    memberships = { listForUser: jest.fn().mockResolvedValue([]), resolveRole: jest.fn() };
    refreshTokens = {
      issue: jest.fn().mockResolvedValue('refresh-plaintext'),
      claim: jest.fn(),
      revoke: jest.fn(),
    };
    service = new AuthService(
      repo as unknown as UserService,
      new TokenService(),
      memberships as unknown as MembershipService,
      refreshTokens as unknown as RefreshTokenService,
    );
  });

  const googleIdentity = (overrides: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
    sub: 'google-sub-1',
    email: 'a@b.com',
    emailVerified: true,
    name: 'A',
    ...overrides,
  });

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      passwordHash,
      isSuperAdmin: false,
      ...overrides,
    }) as User;

  describe('register', () => {
    it('hashes the password and returns a signed token', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (data) => makeUser(data));

      const result = await service.register({
        email: 'new@b.com',
        name: 'New',
        password: 'password123',
      });

      const created = repo.create.mock.calls[0]?.[0];
      expect(created?.passwordHash).toBeDefined();
      expect(created?.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', created?.passwordHash as string)).toBe(true);
      expect(created?.email).toBe('new@b.com');
      expect(typeof result.token).toBe('string');
    });

    it('throws ConflictException when the email already exists', async () => {
      repo.findByEmail.mockResolvedValue(makeUser());
      await expect(
        service.register({ email: 'a@b.com', name: 'A', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token on valid credentials', async () => {
      repo.findByEmail.mockResolvedValue(makeUser());
      const result = await service.login({ email: 'a@b.com', password: 'password123' });
      expect(typeof result.token).toBe('string');
      expect(result.user.id).toBe('u-1');
    });

    it('throws UnauthorizedException on wrong password', async () => {
      repo.findByEmail.mockResolvedValue(makeUser());
      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      repo.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'missing@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an OAuth-only account (no password) with valid-looking input', async () => {
      repo.findByEmail.mockResolvedValue(makeUser({ passwordHash: null }));
      await expect(
        service.login({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('resolveGoogleUser', () => {
    it('returns an already-linked account and mints a session for it', async () => {
      const linked = makeUser({ provider: 'google', providerAccountId: 'google-sub-1' });
      repo.findByProviderAccount.mockResolvedValue(linked);

      const user = await service.resolveGoogleUser(googleIdentity());
      const result = await service.issueSessionFor(user);

      expect(user.id).toBe('u-1');
      expect(typeof result.token).toBe('string');
      expect(repo.findByEmail).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('links a verified Google email onto an existing password account', async () => {
      repo.findByProviderAccount.mockResolvedValue(null);
      repo.findByEmail.mockResolvedValue(makeUser());

      await service.resolveGoogleUser(googleIdentity());

      expect(repo.linkProvider).toHaveBeenCalledWith('u-1', 'google', 'google-sub-1');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('provisions a passwordless user when no account exists', async () => {
      repo.findByProviderAccount.mockResolvedValue(null);
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (data) => makeUser(data));

      await service.resolveGoogleUser(googleIdentity({ email: 'new@b.com' }));

      const created = repo.create.mock.calls[0]?.[0];
      expect(created?.provider).toBe('google');
      expect(created?.providerAccountId).toBe('google-sub-1');
      expect(created?.passwordHash).toBeUndefined();
    });

    it('refuses an unverified Google email', async () => {
      await expect(
        service.resolveGoogleUser(googleIdentity({ emailVerified: false })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.findByProviderAccount).not.toHaveBeenCalled();
    });
  });
});

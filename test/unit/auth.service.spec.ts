import { ConflictException, UnauthorizedException } from '@common/exceptions';
import { AuthService } from '@modules/auth/auth.service';
import { TokenService } from '@modules/auth/token.service';
import type { MembershipService } from '@modules/membership/membership.service';
import type { User } from '@modules/user/user.entity';
import type { UserRepository } from '@modules/user/user.repository';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let repo: jest.Mocked<Pick<UserRepository, 'findByEmail' | 'create'>>;
  let memberships: jest.Mocked<Pick<MembershipService, 'listForUser' | 'resolveRole'>>;
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 12);
  });

  beforeEach(() => {
    repo = { findByEmail: jest.fn(), create: jest.fn() };
    memberships = { listForUser: jest.fn().mockResolvedValue([]), resolveRole: jest.fn() };
    service = new AuthService(
      repo as unknown as UserRepository,
      new TokenService(),
      memberships as unknown as MembershipService,
    );
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

      const created = repo.create.mock.calls[0]![0];
      expect(created.passwordHash).toBeDefined();
      expect(created.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', created.passwordHash as string)).toBe(true);
      expect(created.email).toBe('new@b.com');
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
  });
});

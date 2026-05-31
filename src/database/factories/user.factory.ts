import { User } from '@modules/user/user.entity';
import bcrypt from 'bcrypt';
import { setSeederFactory } from 'typeorm-extension';

/** Default password shared by all seeded users (dev/test convenience). */
export const SEED_PASSWORD = 'password123';

/**
 * Factory producing fake users with a pre-hashed default password. Registered
 * with typeorm-extension and consumed by seeders.
 */
export const userFactory = setSeederFactory(User, async (faker) => {
  const user = new User();
  user.email = faker.internet.email().toLowerCase();
  user.name = faker.person.fullName();
  user.passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  user.roles = ['user'];
  return user;
});

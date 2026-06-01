import { User } from '@modules/user/user.entity';
import bcrypt from 'bcryptjs';
import { setSeederFactory } from 'typeorm-extension';

export const SEED_PASSWORD = 'Abc@123456';

export const userFactory = setSeederFactory(User, async (faker) => {
  const user = new User();
  user.email = faker.internet.email().toLowerCase();
  user.name = faker.person.fullName();
  user.passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  user.roles = ['user'];
  return user;
});

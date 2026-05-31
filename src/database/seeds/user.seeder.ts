import { SEED_PASSWORD } from '@database/factories/user.factory';
import { User } from '@modules/user/user.entity';
import bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import type { Seeder, SeederFactoryManager } from 'typeorm-extension';

/**
 * Seeds a deterministic admin account plus a batch of random users. Idempotent:
 * skips users whose email already exists.
 */
export class UserSeeder implements Seeder {
  async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    const repo = dataSource.getRepository(User);

    const adminEmail = 'admin@example.com';
    if (!(await repo.findOne({ where: { email: adminEmail } }))) {
      await repo.save(
        repo.create({
          email: adminEmail,
          name: 'Admin',
          passwordHash: await bcrypt.hash(SEED_PASSWORD, 12),
          roles: ['admin', 'user'],
        }),
      );
    }

    const userFactory = factoryManager.get(User);
    await userFactory.saveMany(10);
  }
}

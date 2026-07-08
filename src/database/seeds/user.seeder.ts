import { SEED_PASSWORD } from '@database/factories/user.factory';
import { User } from '@modules/user/user.entity';
import bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';
import type { Seeder, SeederFactoryManager } from 'typeorm-extension';

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
          isSuperAdmin: true,
        }),
      );
    }

    const userFactory = factoryManager.get(User);
    await userFactory.saveMany(10);
  }
}

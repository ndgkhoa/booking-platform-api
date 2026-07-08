import { SEED_PASSWORD } from '@database/factories/user.factory';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { TenantRole } from '@modules/tenant/tenant-role.enum';
import { PlatformRole } from '@modules/user/platform-role.enum';
import { User } from '@modules/user/user.entity';
import bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';
import type { Seeder, SeederFactoryManager } from 'typeorm-extension';

export class UserSeeder implements Seeder {
  async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    const users = dataSource.getRepository(User);

    // Seed a loginable owner account: user + tenant + owner membership. Login
    // requires a tenant membership, so the admin needs its own tenant.
    const adminEmail = 'admin@example.com';
    if (!(await users.findOne({ where: { email: adminEmail } }))) {
      const admin = await users.save(
        users.create({
          email: adminEmail,
          name: 'Admin',
          passwordHash: await bcrypt.hash(SEED_PASSWORD, 12),
          platformRole: PlatformRole.SUPER_ADMIN,
        }),
      );
      const tenant = await dataSource
        .getRepository(Tenant)
        .save(
          dataSource.getRepository(Tenant).create({ name: 'Demo Tenant', slug: 'demo-tenant' }),
        );
      await dataSource.getRepository(TenantMember).save(
        dataSource.getRepository(TenantMember).create({
          tenantId: tenant.id,
          userId: admin.id,
          role: TenantRole.OWNER,
          joinedAt: new Date(),
        }),
      );
    }

    const userFactory = factoryManager.get(User);
    await userFactory.saveMany(10);
  }
}

import 'reflect-metadata';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { userFactory } from '@database/factories/user.factory';
import { UserSeeder } from '@database/seeds/user.seeder';
import { runSeeders } from 'typeorm-extension';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await runSeeders(AppDataSource, {
      seeds: [UserSeeder],
      factories: [userFactory],
    });
    logger.info('Seeding completed');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

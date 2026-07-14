import 'reflect-metadata';
import { AppDataSource } from '@config/data-source';
import { logger } from '@config/logger';
import { seedAll, unseedAll } from '@database/seeds/database.seeder';

// `--down` tears the seed data down; otherwise seed (reset to the known dataset).
const down = process.argv.includes('--down');

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await (down ? unseedAll : seedAll)(AppDataSource);
    logger.info(down ? 'Unseeding completed' : 'Seeding completed');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

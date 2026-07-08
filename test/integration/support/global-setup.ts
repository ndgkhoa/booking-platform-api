import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();

  const dataSource = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    migrations: [path.join(__dirname, '../../../src/database/migrations/*.{ts,js}')],
    synchronize: false,
  });
  await dataSource.initialize();
  await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await dataSource.runMigrations();
  await dataSource.destroy();

  process.env.TEST_DATABASE_URL = container.getConnectionUri();
  (globalThis as Record<string, unknown>).__TEST_PG_CONTAINER__ = container;
}

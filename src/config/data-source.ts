import path from 'node:path';
import 'reflect-metadata';
import { env } from '@config/env';
import { DataSource } from 'typeorm';

/**
 * Shared TypeORM DataSource used by the application, the migration CLI, and the
 * seeder. `synchronize` is always false — schema changes go through migrations.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: env.isDevelopment,
  // Globs resolve to .ts under tsx/ts-node (dev + CLI) and .js after build.
  entities: [path.join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
});

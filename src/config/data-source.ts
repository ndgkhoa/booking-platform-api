import path from 'node:path';
import 'reflect-metadata';
import { env } from '@config/env';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: env.isDevelopment,
  entities: [path.join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
  // Each tenant request holds a pooled connection with an open transaction for
  // the handler's duration, so bound the pool and cap held time DB-side.
  poolSize: env.DB_POOL_MAX,
  extra: {
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
  },
});

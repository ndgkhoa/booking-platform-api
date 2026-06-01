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
});

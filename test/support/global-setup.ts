import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';

// Throwaway credentials for ephemeral containers bound to random local ports — not real secrets.
const REDIS_PASSWORD = 'test-redis-secret';
const APP_DB_ROLE = 'app_rls_user';
const APP_DB_PASSWORD = 'test-app-db-secret';

// Boots Postgres (real migrations, non-superuser app role so RLS is actually enforced) and Redis for the
// integration run, writing connection details to `process.env` before any spec imports `@config/env`.
export default async function globalSetup(): Promise<void> {
  const [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18.4').start(),
    new RedisContainer('redis:8.8.0').withPassword(REDIS_PASSWORD).start(),
  ]);

  const superuserUrl = pg.getConnectionUri();

  const migrator = new DataSource({
    type: 'postgres',
    url: superuserUrl,
    migrations: [path.join(__dirname, '..', '..', 'src', 'database', 'migrations', '*.{ts,js}')],
  });
  await migrator.initialize();
  await migrator.runMigrations();

  await migrator.query(
    `CREATE ROLE "${APP_DB_ROLE}" LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER`,
  );
  await migrator.query(`GRANT USAGE ON SCHEMA public TO "${APP_DB_ROLE}"`);
  await migrator.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_DB_ROLE}"`,
  );
  await migrator.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_DB_ROLE}"`);
  await migrator.destroy();

  const globals = globalThis as {
    __PG_CONTAINER__?: unknown;
    __REDIS_CONTAINER__?: unknown;
  };
  globals.__PG_CONTAINER__ = pg;
  globals.__REDIS_CONTAINER__ = redis;

  // Superuser URL — for seeding/cleanup that must bypass RLS.
  process.env.TEST_DATABASE_URL = superuserUrl;
  // Non-superuser URL — the app connects through this so RLS is enforced.
  process.env.TEST_APP_DATABASE_URL = `postgresql://${APP_DB_ROLE}:${APP_DB_PASSWORD}@${pg.getHost()}:${pg.getPort()}/${pg.getDatabase()}`;

  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getPort());
  process.env.REDIS_PASSWORD = REDIS_PASSWORD;
}

import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';

// Throwaway credentials for the ephemeral containers. Not secrets: the
// containers live only for the test run and bind to random local ports.
const REDIS_PASSWORD = 'test-redis-secret';
const APP_DB_ROLE = 'app_rls_user';
const APP_DB_PASSWORD = 'test-app-db-secret';

/**
 * Boots the shared infrastructure for the whole integration run:
 *
 * - Postgres: runs the REAL migrations (not `synchronize`) so the schema — and
 *   crucially its RLS policies — match production exactly. A dedicated
 *   non-superuser role (`app_rls_user`) is created for the app under test, so
 *   RLS is actually enforced end-to-end (a superuser would silently bypass it).
 *   The bootstrap superuser stays available for seeding/cleanup that needs to
 *   bypass RLS.
 * - Redis: a password-protected instance the BullMQ queues connect to.
 *
 * Connection details and Redis credentials are written into `process.env`
 * BEFORE any spec imports `@config/env` (which snapshots the environment at load
 * time), so both the app and the queues target the containers.
 */
export default async function globalSetup(): Promise<void> {
  const [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18.4').start(),
    new RedisContainer('redis:8.8.0').withPassword(REDIS_PASSWORD).start(),
  ]);

  const superuserUrl = pg.getConnectionUri();

  // Run migrations and provision the app role on the bootstrap superuser.
  const migrator = new DataSource({
    type: 'postgres',
    url: superuserUrl,
    migrations: [path.join(__dirname, '..', '..', 'src', 'database', 'migrations', '*.{ts,js}')],
  });
  await migrator.initialize();
  // Migrations default ids with uuid_generate_v4(); provision the extension the
  // same way production does before applying them.
  await migrator.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
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

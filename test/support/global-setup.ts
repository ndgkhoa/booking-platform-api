import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Starts ONE Postgres container for the whole integration run and publishes its
 * URI via `TEST_DATABASE_URL`. Each spec then opens a lightweight DataSource
 * against it (see integration-context.ts) instead of booting its own container.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:18.4').start();
  (globalThis as { __PG_CONTAINER__?: unknown }).__PG_CONTAINER__ = container;
  process.env.TEST_DATABASE_URL = container.getConnectionUri();
}

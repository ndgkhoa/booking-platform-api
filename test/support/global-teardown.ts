import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';

export default async function globalTeardown(): Promise<void> {
  const globals = globalThis as {
    __PG_CONTAINER__?: StartedPostgreSqlContainer;
    __REDIS_CONTAINER__?: StartedRedisContainer;
  };
  await Promise.all([globals.__PG_CONTAINER__?.stop(), globals.__REDIS_CONTAINER__?.stop()]);
}

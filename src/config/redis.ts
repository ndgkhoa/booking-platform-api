import { env } from '@config/env';
import { Redis, type RedisOptions } from 'ioredis';

/**
 * Connection options shared by the cache client and BullMQ.
 * `maxRetriesPerRequest: null` is REQUIRED by BullMQ on its connection.
 */
export const redisConnectionOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

/**
 * Shared Redis client for application caching. `lazyConnect` keeps the app
 * bootable when Redis is down — the connection opens on first command.
 * BullMQ manages its own connections from `redisConnectionOptions`.
 */
export const redis = new Redis({
  ...redisConnectionOptions,
  lazyConnect: true,
});

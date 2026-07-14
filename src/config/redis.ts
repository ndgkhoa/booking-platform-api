import { env } from '@config/env';
import { Redis, type RedisOptions } from 'ioredis';

export const redisConnectionOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  // Connect on first use so importing a queue never forces an eager connection.
  lazyConnect: true,
};

export const redis = new Redis({
  ...redisConnectionOptions,
  lazyConnect: true,
});

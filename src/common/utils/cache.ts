import { redis } from '@config/redis';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(key, payload, 'EX', ttlSeconds);
  } else {
    await redis.set(key, payload);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

# Phase 06 — Caching & Job Queue

**Priority:** Medium | **Status:** pending | **Depends:** 02

ioredis client (shared) + BullMQ queue/worker example with graceful lifecycle.

## Redis client — `src/config/redis.ts`
```ts
import { Redis } from 'ioredis';
import { env } from '@config/env';
export const redis = new Redis({
  host: env.REDIS_HOST, port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,  
  maxRetriesPerRequest: null,
});
// BullMQ REQUIRES maxRetriesPerRequest: null on its connection
```
Register in typedi (`Container.set(Redis, redis)`) so services can inject for caching.

## Cache helper (optional, KISS) — `src/common/utils/cache.ts`
Thin get/set-json with TTL using `redis`. Used by services, not controllers.

## BullMQ queue — `src/jobs/queues/email.queue.ts`
```ts
import { Queue } from 'bullmq';
import { redis } from '@config/redis';
export const emailQueue = new Queue('email', { connection: redis });
```
Provide `enqueueWelcomeEmail(userId)` helper; `AuthService.register` can enqueue (demonstrates pattern).

## BullMQ worker — `src/jobs/workers/email.worker.ts`
```ts
import { Worker } from 'bullmq';
import { redis } from '@config/redis';
import { logger } from '@config/logger';
export const emailWorker = new Worker('email', async (job) => {
  logger.info(`Processing email job ${job.id}`, job.data);
  // real send here
}, { connection: redis });
emailWorker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed: ${err.message}`));
```
> Decide run model: same process (start worker in index.ts) OR separate `src/worker.ts` entry + `pnpm worker` script. Boilerplate: separate entry, documented, default off.

## Files
config/redis.ts, common/utils/cache.ts, jobs/queues/email.queue.ts, jobs/workers/email.worker.ts, (optional) src/worker.ts + script.

## Todo
- [ ] ioredis client (`maxRetriesPerRequest:null`) + typedi register
- [ ] cache util (get/set json + ttl)
- [ ] email queue + enqueue helper
- [ ] email worker + failure logging
- [ ] separate worker entry + `pnpm worker` script
- [ ] graceful close of queue/worker/redis in shutdown (phase 07)

## Success Criteria
- Enqueued job processed by worker; failures logged via winston.
- Redis connection reused (single client), closes cleanly on shutdown.

## Unresolved
- Worker scaling/concurrency left default — document `concurrency` option.

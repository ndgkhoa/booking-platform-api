# Phase 07 — Monitoring & Health

**Priority:** High | **Status:** pending | **Depends:** 02

Prometheus metrics (prom-client) + @godaddy/terminus health checks and graceful shutdown. Finalizes `index.ts` bootstrap.

## Metrics — `src/health/metrics.ts`
```ts
import client from 'prom-client';
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
export const httpHistogram = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'HTTP duration',
  labelNames: ['method', 'route', 'status'], registers: [registry],
});
```
- Express middleware times each request → `httpHistogram`. Register before routing-controllers in server.ts.
- Expose raw (NON-enveloped) endpoint: `app.get('/metrics', async (_, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); })`.

## Health + graceful shutdown — `src/index.ts` (terminus)
```ts
import 'reflect-metadata';
import http from 'http';
import { createTerminus } from '@godaddy/terminus';
import { createServer } from '@/server';
import { AppDataSource } from '@config/data-source';
import { redis } from '@config/redis';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { logger } from '@config/logger';

async function bootstrap() {
  await AppDataSource.initialize();
  Container.set(DataSource, AppDataSource);     // enables repository injection
  const app = createServer();
  const server = http.createServer(app);
  createTerminus(server, {
    healthChecks: {
      '/health': async () => {
        await AppDataSource.query('SELECT 1');
        await redis.ping();
        return { db: 'up', redis: 'up' };
      },
      '/health/live': async () => ({ status: 'ok' }),
    },
    onSignal: async () => {                       // cleanup on SIGTERM/SIGINT
      logger.info('Shutting down...');
      await AppDataSource.destroy();
      await redis.quit();
    },
    logger: (msg, err) => logger.error(msg, err),
  });
  server.listen(env.PORT, () => logger.info(`Listening on :${env.PORT}`));
}
bootstrap().catch((e) => { logger.error(e); process.exit(1); });
```
> terminus owns `/health` (readiness, checks deps) + `/health/live` (liveness). Returns 503 when a check throws.

## Files
health/metrics.ts, extend server.ts (timing middleware + `/metrics`), finalize index.ts.

## Todo
- [ ] prom-client registry + default + http histogram
- [ ] timing middleware + `/metrics` raw endpoint
- [ ] terminus `/health` (db+redis) + `/health/live`
- [ ] onSignal closes DataSource + redis (+ bullmq from phase 06)
- [ ] finalize index.ts bootstrap order (reflect-metadata → DS init → container → server)

## Success Criteria
- `/metrics` returns Prometheus text. `/health` 200 when deps up, 503 when DB down.
- SIGTERM drains connections, closes DataSource/redis, exits 0.

## Security
- Consider gating `/metrics` (internal network / bearer) — env flag `METRICS_ENABLED`. Note in docs.

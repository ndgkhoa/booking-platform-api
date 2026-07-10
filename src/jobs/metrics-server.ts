import http from 'node:http';
import { registry } from '@common/monitoring/metrics';
import { env } from '@config/env';
import { logger } from '@config/logger';

/**
 * Exposes the worker process's Prometheus registry over HTTP. Outbox counters and
 * backlog gauges are mutated in THIS process, so they must be scraped here — the
 * API's /metrics only reflects the API process's registry.
 */
export function startWorkerMetricsServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      registry
        .metrics()
        .then((body) => {
          res.setHeader('Content-Type', registry.contentType);
          res.end(body);
        })
        .catch(() => {
          res.statusCode = 500;
          res.end();
        });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(env.WORKER_METRICS_PORT, () => {
    logger.info(`Worker metrics on http://localhost:${env.WORKER_METRICS_PORT}/metrics`);
  });
  return server;
}

import client from 'prom-client';

/** Dedicated Prometheus registry (keeps app metrics isolated from global default). */
export const registry = new client.Registry();

// Node/process metrics (event loop lag, heap, GC, CPU, ...).
client.collectDefaultMetrics({ register: registry });

/** Per-request latency histogram, labelled by method, route, and status code. */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

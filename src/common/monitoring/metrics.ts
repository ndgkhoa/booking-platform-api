import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

/** Events dispatched by the outbox relay, labelled by outcome. */
export const outboxDispatched = new client.Counter({
  name: 'outbox_events_dispatched_total',
  help: 'Total outbox events dispatched by the relay',
  labelNames: ['result'] as const,
  registers: [registry],
});

/** Backlog gauge: pending outbox events and the age of the oldest one. */
export const outboxPending = new client.Gauge({
  name: 'outbox_events_pending',
  help: 'Current number of pending outbox events',
  registers: [registry],
});

export const outboxOldestPendingSeconds = new client.Gauge({
  name: 'outbox_oldest_pending_seconds',
  help: 'Age in seconds of the oldest pending outbox event',
  registers: [registry],
});

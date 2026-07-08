# Phase 9 — Observability, security, audit

## Context links
- Cross-cutting (after Phase 4). context7-verified OpenTelemetry NodeSDK usage. Reuse `logger.ts`, `metrics.ts`, `error-handler.middleware.ts`, terminus in `index.ts`.

## Overview
- **Priority:** medium-high · **Status:** pending.
- Distributed tracing, error monitoring, audit trail, per-tenant rate limiting.

## Key insights (context7-verified)
- OTel: `new NodeSDK({ traceExporter: new OTLPTraceExporter(), instrumentations: [getNodeAutoInstrumentations()] }).start()` — **init before any other import** via preload (`node -r ./dist/tracing.js dist/index.js`); `sdk.shutdown()` on SIGTERM (fold into terminus).

## Architecture
- `src/tracing.ts` — NodeSDK + auto-instrumentations (http/express/pg/ioredis) + OTLP exporter; service name `booking-flow-api`. docker-compose adds Jaeger/Tempo for local viewing.
- Correlation id: propagate trace id into winston logs.
- Sentry: `@sentry/node` init; capture 5xx in `error-handler.middleware.ts`; release + source maps.
- Audit: `audit_logs` (tenant_id, actor_id, action, target, metadata, created_at) written via an interceptor/service on sensitive ops (booking status change, member invite/remove, plan/payment change).
- Per-tenant rate limit: Redis store keyed by tenant, tier-aware limits (ties to Phase 7).

## Todo
- [ ] `src/tracing.ts` + preload wiring + docker-compose Jaeger
- [ ] Correlation id in logs
- [ ] Sentry init + capture in error handler
- [ ] `audit_logs` + interceptor on sensitive actions
- [ ] Per-tenant rate limiting
- [ ] Tests/manual: trace visible, Sentry event, audit rows

## Success criteria
- End-to-end trace visible in Jaeger (HTTP→service→pg→redis); Sentry captures a forced error; audit rows recorded for sensitive actions; per-tenant limits enforced.

## Risks
- OTel preload must run before `reflect-metadata`/DI import — validate order. Avoid tracing PII in span attributes.

## Next
- Phase 10 ships coverage/contract/load tests + CI/CD.

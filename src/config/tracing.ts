import { env } from '@config/env';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * OpenTelemetry bootstrap — MUST be the first import in every entrypoint
 * (`index.ts`, `worker.ts`) so auto-instrumentations patch http/express/pg/ioredis
 * before those modules are required. Disabled unless `OTEL_ENABLED=true`, so dev,
 * test and CI need no collector. Spans propagate HTTP → service → BullMQ → worker.
 */
let sdk: NodeSDK | undefined;

if (env.OTEL_ENABLED) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  const shutdown = (): void => {
    void sdk?.shutdown();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

export { sdk };

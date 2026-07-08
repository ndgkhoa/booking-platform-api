import { env } from '@config/env';
import { trace } from '@opentelemetry/api';
import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

/** Stamps every log line with the active OTel trace/span id for correlation. */
const traceContext = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info.traceId = ctx.traceId;
    info.spanId = ctx.spanId;
  }
  return info;
});

const devFormat = combine(
  traceContext(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack, traceId }) => {
    const trace = traceId ? ` [trace=${String(traceId).slice(0, 8)}]` : '';
    return `${timestamp} ${level}:${trace} ${stack ?? message}`;
  }),
);

const prodFormat = combine(traceContext(), timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.isTest,
});

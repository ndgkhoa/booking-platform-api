import { env } from '@config/env';
import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

/** Human-friendly console format for local development. */
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack }) => `${timestamp} ${level}: ${stack ?? message}`),
);

/** Structured JSON format for production log aggregation. */
const prodFormat = combine(timestamp(), errors({ stack: true }), json());

/**
 * Singleton application logger. Uses winston's default npm levels
 * (error, warn, info, http, verbose, debug, silly) — `http` is consumed
 * by the morgan bridge middleware.
 */
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.isTest,
});

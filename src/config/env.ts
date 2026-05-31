import 'dotenv/config';
import { bool, cleanEnv, host, port, str } from 'envalid';

/**
 * Validated, strongly-typed environment configuration.
 * Fails fast at startup if any required variable is missing or malformed.
 */
export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3000 }),
  CORS_ORIGIN: str({ default: '*' }),

  // PostgreSQL
  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(),
  DB_NAME: str(),

  // Auth
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),

  // Redis
  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),

  // Observability
  LOG_LEVEL: str({ default: 'info' }),
  SWAGGER_ENABLED: bool({ default: true }),
  METRICS_ENABLED: bool({ default: true }),
});

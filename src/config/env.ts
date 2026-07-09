import 'dotenv/config';
import { bool, cleanEnv, host, num, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3000 }),
  CORS_ORIGIN: str({ default: '*' }),
  APP_URL: str({ default: 'http://localhost:3000' }),

  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(),
  DB_NAME: str(),
  DB_POOL_MAX: num({ default: 10 }),

  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),
  REFRESH_TOKEN_TTL_DAYS: num({ default: 30 }),
  INVITE_TTL_DAYS: num({ default: 7 }),

  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),

  LOG_LEVEL: str({ default: 'info' }),
  SWAGGER_ENABLED: bool({ default: true }),
  METRICS_ENABLED: bool({ default: true }),

  OTEL_ENABLED: bool({ default: false }),
  OTEL_SERVICE_NAME: str({ default: 'booking-platform-api' }),
  OTEL_EXPORTER_OTLP_ENDPOINT: str({ default: 'http://localhost:4318/v1/traces' }),
});

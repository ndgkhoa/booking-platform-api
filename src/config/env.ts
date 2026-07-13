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
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX: num({ default: 100 }),

  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(),
  DB_NAME: str(),
  DB_POOL_MAX: num({ default: 10 }),

  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),
  // Google OAuth (authorization-code flow), all optional. Missing client id/secret
  // disables the /auth/google routes. CALLBACK_URL must match the one registered in
  // Google Cloud; SUCCESS_REDIRECT is the frontend the callback hands tokens back to.
  GOOGLE_CLIENT_ID: str({ default: undefined }),
  GOOGLE_CLIENT_SECRET: str({ default: undefined }),
  GOOGLE_CALLBACK_URL: str({ default: undefined }),
  GOOGLE_SUCCESS_REDIRECT: str({ default: undefined }),
  REFRESH_TOKEN_TTL_DAYS: num({ default: 30 }),
  INVITE_TTL_DAYS: num({ default: 7 }),
  SEPAY_WEBHOOK_SECRET: str(),
  STRIPE_WEBHOOK_SECRET: str(),
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: num({ default: 300 }),

  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),

  LOG_LEVEL: str({ default: 'info' }),
  SWAGGER_ENABLED: bool({ default: true }),
  METRICS_ENABLED: bool({ default: true }),
  WORKER_METRICS_PORT: port({ default: 9100 }),

  OTEL_ENABLED: bool({ default: false }),
  OTEL_SERVICE_NAME: str({ default: 'booking-platform-api' }),
  OTEL_EXPORTER_OTLP_ENDPOINT: str(),
});

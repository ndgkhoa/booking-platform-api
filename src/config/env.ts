import 'dotenv/config';
import { bool, cleanEnv, host, num, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
  // Application
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  APP_URL: str({ default: 'http://localhost:3000' }),
  WEB_APP_URL: str({ default: 'http://localhost:5173' }),

  // HTTP
  CORS_ORIGIN: str({ default: '*' }),
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX: num({ default: 100 }),

  // PostgreSQL
  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(),
  DB_NAME: str(),
  DB_POOL_MAX: num({ default: 10 }),

  // Auth
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),
  REFRESH_TOKEN_TTL_DAYS: num({ default: 30 }),
  INVITE_TTL_DAYS: num({ default: 7 }),

  // Google OAuth
  GOOGLE_CLIENT_ID: str({ default: undefined }),
  GOOGLE_CLIENT_SECRET: str({ default: undefined }),
  GOOGLE_CALLBACK_URL: str({ default: undefined }),
  GOOGLE_SUCCESS_REDIRECT: str({ default: undefined }),

  // Payments
  SEPAY_WEBHOOK_SECRET: str(),
  STRIPE_WEBHOOK_SECRET: str(),
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: num({ default: 300 }),

  // Mail
  RESEND_API_KEY: str({ default: undefined }),
  MAIL_FROM: str({ default: 'Booking <onboarding@resend.dev>' }),

  // Redis
  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),

  // Observability
  LOG_LEVEL: str({ default: 'info' }),
  SWAGGER_ENABLED: bool({ default: true }),
  METRICS_ENABLED: bool({ default: true }),
  WORKER_METRICS_PORT: port({ default: 9100 }),

  // Tracing
  OTEL_ENABLED: bool({ default: false }),
  OTEL_SERVICE_NAME: str({ default: 'booking-platform-api' }),
  OTEL_EXPORTER_OTLP_ENDPOINT: str(),
});

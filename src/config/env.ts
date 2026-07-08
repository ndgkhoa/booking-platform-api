import 'dotenv/config';
import { bool, cleanEnv, host, num, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3000 }),
  CORS_ORIGIN: str({ default: '*' }),

  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(),
  DB_NAME: str(),
  DB_SSL: bool({ default: false }),
  DB_POOL_MAX: num({ default: 10 }),
  DB_POOL_IDLE_TIMEOUT_MS: num({ default: 10_000 }),
  DB_CONNECTION_TIMEOUT_MS: num({ default: 5_000 }),

  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),

  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),

  LOG_LEVEL: str({ default: 'info' }),
  SWAGGER_ENABLED: bool({ default: true }),
  METRICS_ENABLED: bool({ default: true }),
});

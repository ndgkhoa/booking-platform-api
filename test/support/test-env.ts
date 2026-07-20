function fallback(key: string, value: string): void {
  if (!process.env[key]) process.env[key] = value;
}

fallback('DB_USER', 'test_user');
fallback('DB_PASSWORD', 'test_password');
fallback('DB_NAME', 'test_db');
fallback('JWT_SECRET', 'test-jwt-secret');
fallback('REDIS_PASSWORD', 'test-redis-secret');
fallback('SEPAY_WEBHOOK_SECRET', 'test-sepay-secret');
fallback('STRIPE_WEBHOOK_SECRET', 'test-stripe-secret');
fallback('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');

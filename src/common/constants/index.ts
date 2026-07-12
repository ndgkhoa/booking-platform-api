/** Time unit conversions in milliseconds — shared so nothing re-derives them. */
export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const MINUTES_PER_DAY = 24 * 60;

/** bcrypt work factor for password hashing. */
export const BCRYPT_ROUNDS = 12;

/** Outbox relay tuning. */
export const OUTBOX_BATCH_SIZE = 20;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_BACKOFF_BASE_MS = 30 * SECOND_MS;
export const OUTBOX_POLL_INTERVAL_MS = 2 * SECOND_MS;

/** Outbound webhook delivery timeout. */
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 5 * SECOND_MS;

/** Largest reporting window accepted, guarding unbounded scans. */
export const REPORT_MAX_RANGE_MS = 366 * DAY_MS;

/** Plan code applied to a tenant that has not subscribed to a paid tier. */
export const DEFAULT_PLAN_CODE = 'free';

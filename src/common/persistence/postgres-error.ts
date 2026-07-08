import { QueryFailedError } from 'typeorm';

/** Postgres SQLSTATE codes the application branches on. */
export const PostgresErrorCode = {
  UNIQUE_VIOLATION: '23505',
} as const;

/** SQLSTATE of a failed query, or undefined if the error isn't a driver error. */
function sqlState(error: unknown): string | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as { code?: string } | undefined)?.code
    : undefined;
}

/** True when the error is a Postgres unique-constraint violation (23505). */
export function isUniqueViolation(error: unknown): boolean {
  return sqlState(error) === PostgresErrorCode.UNIQUE_VIOLATION;
}

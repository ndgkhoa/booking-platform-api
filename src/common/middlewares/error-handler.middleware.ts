import type { ApiError } from '@common/types/api-response';
import { env } from '@config/env';
import { logger } from '@config/logger';
import type { NextFunction, Request, Response } from 'express';
import { type ExpressErrorMiddlewareInterface, Middleware } from 'routing-controllers';
import { Service } from 'typedi';

/** Maps an HTTP status to a stable, machine-readable error code. */
const STATUS_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  500: 'INTERNAL_ERROR',
};

interface ValidationErrorLike {
  property: string;
  constraints?: Record<string, string>;
  children?: ValidationErrorLike[];
}

function isValidationErrors(value: unknown): value is ValidationErrorLike[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'property' in value[0]
  );
}

/** Flattens class-validator errors to `{ field, messages }`, dropping `target`/`value`
 * so submitted data (e.g. passwords) is never echoed back. */
function formatValidationErrors(errors: ValidationErrorLike[]): unknown[] {
  return errors.map((e) => ({
    field: e.property,
    messages: e.constraints ? Object.values(e.constraints) : undefined,
    children: e.children?.length ? formatValidationErrors(e.children) : undefined,
  }));
}

/**
 * Global error handler. Registered as an `after` middleware and paired with
 * `defaultErrorHandler: false`, so it owns ALL error responses and renders the
 * standard error envelope. Handles AppException, routing-controllers HttpError,
 * class-validator failures, and unexpected errors.
 */
@Service()
@Middleware({ type: 'after' })
export class ErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: any, _req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
      next(error);
      return;
    }

    let status: number = error.httpCode || error.status || 500;
    let details: unknown = error.details;
    let message: string = error.message ?? 'Error';

    // routing-controllers wraps class-validator failures in a 400 with `.errors`.
    if (isValidationErrors(error.errors)) {
      status = 422;
      details = formatValidationErrors(error.errors);
      message = 'Validation failed';
    } else if (details === undefined && error.errors !== undefined) {
      details = error.errors;
    }

    const code: string = error.errorCode ?? STATUS_CODE[status] ?? 'ERROR';

    if (status >= 500) {
      logger.error(error.stack ?? error.message ?? String(error));
      if (env.isProduction) message = 'Internal Server Error';
    }

    const body: ApiError = {
      success: false,
      error: { code, message, details },
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }
}

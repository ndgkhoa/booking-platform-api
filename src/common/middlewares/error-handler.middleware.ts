import { buildProblem, PROBLEM_CONTENT_TYPE } from '@common/types/problem-details';
import { env } from '@config/env';
import { logger } from '@config/logger';
import type { NextFunction, Request, Response } from 'express';
import { type ExpressErrorMiddlewareInterface, Middleware } from 'routing-controllers';
import { Service } from 'typedi';

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

function formatValidationErrors(errors: ValidationErrorLike[]): unknown[] {
  return errors.map((e) => ({
    field: e.property,
    messages: e.constraints ? Object.values(e.constraints) : undefined,
    children: e.children?.length ? formatValidationErrors(e.children) : undefined,
  }));
}

@Service()
@Middleware({ type: 'after' })
export class ErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: any, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
      next(error);
      return;
    }

    let status: number = error.httpCode || error.status || 500;
    let errors: unknown = error.details;
    let detail: string = error.message ?? 'Error';

    if (isValidationErrors(error.errors)) {
      status = 422;
      errors = formatValidationErrors(error.errors);
      detail = 'Validation failed';
    } else if (errors === undefined && error.errors !== undefined) {
      errors = error.errors;
    }

    const code: string = error.errorCode ?? STATUS_CODE[status] ?? 'ERROR';

    if (status >= 500) {
      logger.error(error.stack ?? error.message ?? String(error));
      if (env.isProduction) detail = 'Internal Server Error';
    }

    const problem = buildProblem({ status, code, detail, instance: req.originalUrl, errors });
    res.status(status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}

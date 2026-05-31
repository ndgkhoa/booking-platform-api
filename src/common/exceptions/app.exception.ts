import { HttpError } from 'routing-controllers';

/**
 * Base application exception. Extends routing-controllers' `HttpError` so the
 * framework automatically sets the HTTP status code. Carries a stable
 * machine-readable `errorCode` and optional `details` for the response envelope.
 */
export class AppException extends HttpError {
  constructor(
    status: number,
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(status, message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestException extends AppException {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class NotFoundException extends AppException {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictException extends AppException {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ValidationException extends AppException {
  constructor(message = 'Validation failed', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

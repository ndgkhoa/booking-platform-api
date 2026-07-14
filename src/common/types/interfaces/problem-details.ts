import { trace } from '@opentelemetry/api';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

// RFC 7807 Problem Details; `code`, `errors`, `traceId` are documented extensions beyond
// the standard type/title/status/detail/instance members.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  errors?: unknown;
  traceId?: string;
}

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export interface BuildProblemInput {
  status: number;
  code: string;
  detail: string;
  instance?: string;
  errors?: unknown;
}

export function buildProblem({
  status,
  code,
  detail,
  instance,
  errors,
}: BuildProblemInput): ProblemDetails {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  return {
    type: 'about:blank',
    title: STATUS_TITLES[status] ?? 'Error',
    status,
    detail,
    instance,
    code,
    errors,
    traceId,
  };
}

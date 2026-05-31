/** Successful response envelope returned for every controller action. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

/** Error response envelope produced by the global error handler. */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/** Pagination metadata attached under `meta` for list endpoints. */
export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Helper to build a pre-enveloped paginated payload (passes through the interceptor). */
export function paginated<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): ApiResponse<T[]> {
  return {
    success: true,
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) } satisfies PaginatedMeta,
    timestamp: new Date().toISOString(),
  };
}

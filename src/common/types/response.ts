export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

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
  };
}

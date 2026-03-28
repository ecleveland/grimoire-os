import { PaginatedResponse } from '@grimoire-os/shared';

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    lastPage: Math.ceil(total / limit) || 1,
  };
}

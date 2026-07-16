export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ListQueryParams = {
  page?: string | number;
  limit?: string | number;
  offset?: string | number;
  search?: string;
  sort?: string;
  order?: string;
  status?: string;
};

export function parsePageParams(
  limitRaw?: string | number,
  offsetRaw?: string | number,
  defaultLimit = DEFAULT_PAGE_LIMIT,
  maxLimit = MAX_PAGE_LIMIT,
) {
  const limit = Math.min(
    Math.max(Number(limitRaw) || defaultLimit, 1),
    maxLimit,
  );
  const offset = Math.max(Number(offsetRaw) || 0, 0);
  return { limit, offset };
}

/** Supports page-based or offset-based paging plus optional search/sort hints. */
export function parseListQuery(
  query: ListQueryParams = {},
  defaultLimit = DEFAULT_PAGE_LIMIT,
  maxLimit = MAX_PAGE_LIMIT,
) {
  const { limit, offset: rawOffset } = parsePageParams(
    query.limit,
    query.offset,
    defaultLimit,
    maxLimit,
  );
  const pageNum = Number(query.page);
  const offset =
    Number.isFinite(pageNum) && pageNum > 0
      ? (pageNum - 1) * limit
      : rawOffset;
  return {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    search: query.search?.trim() ?? '',
    sort: query.sort?.trim() ?? '',
    order: query.order?.toLowerCase() === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}

export function toPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResponse<T> {
  return { data, total, limit, offset };
}

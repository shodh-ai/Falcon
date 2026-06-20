export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
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

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export const DEFAULT_PAGE_SIZE = 20;

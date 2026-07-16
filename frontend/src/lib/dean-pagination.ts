export type PaginatedApiResponse<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export function buildDeanPageQuery(params: {
  page: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('limit', String(params.limit ?? 20));
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  return qs.toString();
}

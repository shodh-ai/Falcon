import type { PaginatedResponse } from '@/lib/api/pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/api/pagination';

export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<PaginatedResponse<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const first = await fetchPage(0, pageSize);
  const all = [...first.data];
  let offset = first.limit;
  while (offset < first.total) {
    const page = await fetchPage(offset, pageSize);
    all.push(...page.data);
    offset += pageSize;
  }
  return all;
}

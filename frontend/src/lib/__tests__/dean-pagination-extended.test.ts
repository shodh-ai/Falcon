import { describe, it, expect } from 'vitest';
import { buildDeanPageQuery } from '@/lib/dean-pagination';

describe('dean-pagination branch coverage', () => {
  it('includes all optional query params', () => {
    const qs = buildDeanPageQuery({
      page: 2,
      limit: 50,
      search: '  slow learners ',
      sort: 'name',
      order: 'desc',
    });
    expect(qs).toContain('page=2');
    expect(qs).toContain('limit=50');
    expect(qs).toContain('search=slow+learners');
    expect(qs).toContain('sort=name');
    expect(qs).toContain('order=desc');
  });
});

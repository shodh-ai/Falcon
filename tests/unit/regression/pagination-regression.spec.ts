import { buildDeanPageQuery } from '../../../frontend/src/lib/dean-pagination';

describe('Pagination regression — dean page query', () => {
  it('builds page and limit params', () => {
    expect(buildDeanPageQuery({ page: 1 })).toContain('page=1');
    expect(buildDeanPageQuery({ page: 2, limit: 50 })).toContain('limit=50');
  });

  it('includes search sort and order when provided', () => {
    const qs = buildDeanPageQuery({
      page: 3,
      search: 'mechanical',
      sort: 'name',
      order: 'desc',
    });
    expect(qs).toContain('search=mechanical');
    expect(qs).toContain('sort=name');
    expect(qs).toContain('order=desc');
  });

  it('omits empty search', () => {
    expect(buildDeanPageQuery({ page: 1, search: '   ' })).not.toContain('search=');
  });
});

describe('Pagination mock contract', () => {
  it('returns stable offset from page/limit', () => {
    const page = 3;
    const limit = 20;
    const offset = (page - 1) * limit;
    expect(offset).toBe(40);
  });
});

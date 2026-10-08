import { describe, it, expect } from 'vitest';
import { buildDeanPageQuery } from '@/lib/dean-pagination';

describe('Dean pagination helper', () => {
  it('builds query string for list APIs', () => {
    expect(buildDeanPageQuery({ page: 2, limit: 25 })).toBe('page=2&limit=25');
  });
});

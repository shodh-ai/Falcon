import { describe, it, expect } from 'vitest';
import { deanSearchResultHref } from '@/lib/dean-search-links';

describe('dean-search-links full matrix', () => {
  const types = [
    'student',
    'faculty',
    'department',
    'course',
    'research',
    'event',
    'meeting',
    'approval',
  ] as const;

  it.each(types)('returns href for %s', (type) => {
    const href = deanSearchResultHref({
      id: 'abc-123',
      name: 'Row',
      subtitle: '',
      type,
    });
    expect(href).toContain('/dean/');
  });
});

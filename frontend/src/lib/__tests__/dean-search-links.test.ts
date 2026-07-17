import { describe, it, expect } from 'vitest';
import { deanSearchResultHref } from '@/lib/dean-search-links';

describe('dean-search-links regression', () => {
  it('builds clickable hrefs for search result types', () => {
    expect(
      deanSearchResultHref({
        id: 's1',
        name: 'Student',
        subtitle: '',
        type: 'student',
      }),
    ).toContain('/dean/students/monitor?student=s1');
    expect(
      deanSearchResultHref({
        id: 'd1',
        name: 'Dept',
        subtitle: '',
        type: 'department',
      }),
    ).toBe('/dean/departments/d1');
    expect(
      deanSearchResultHref({
        id: 'x',
        name: 'Unknown',
        subtitle: '',
        type: 'unknown',
      }),
    ).toBeNull();
  });
});

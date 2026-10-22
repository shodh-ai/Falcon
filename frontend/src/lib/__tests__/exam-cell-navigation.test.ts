import { describe, expect, it } from 'vitest';
import { collectNavHrefs, examCellPortal, withAccountSettingsNav } from '@/lib/navigation';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Examination Cell navigation', () => {
  it('organizes all specialist routes within the eight operational sections', () => {
    expect(examCellPortal.navGroups.map((group) => group.title)).toEqual([
      'Dashboard',
      'Exam Planning',
      'Students & Eligibility',
      'Admit Cards',
      'Exam Operations',
      'Marks & Results',
      'Reports & Compliance',
      'Master Data & Settings',
    ]);
  });

  it('keeps the primary workflow routes available exactly once', () => {
    const hrefs = collectNavHrefs(examCellPortal.navGroups);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(42);
    hrefs.forEach((href) => expect(existsSync(join(process.cwd(), 'src/app/(portals)', href, 'page.tsx'))).toBe(true));
    examCellPortal.navGroups.forEach((group) => expect(group.items.some((item) => item.href === group.homeHref)).toBe(true));
    expect(hrefs).toEqual(expect.arrayContaining([
      '/exam-cell/schedule',
      '/exam-cell/form-fillup',
      '/exam-cell/eligibility',
      '/exam-cell/hall-ticket-approvals',
      '/exam-cell/admit-cards',
      '/exam-cell/exam-day',
      '/exam-cell/results',
      '/exam-cell/grade-cards',
      '/exam-cell/reports',
      '/exam-cell/settings',
      '/exam-cell/profile',
    ]));
    expect(withAccountSettingsNav(examCellPortal).navGroups).toHaveLength(8);
  });
});

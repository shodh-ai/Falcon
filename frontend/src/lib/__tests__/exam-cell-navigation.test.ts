import { describe, expect, it } from 'vitest';
import {
  examCellPortal,
  withAccountSettingsNav,
  withRoleAwareDofaInboxNav,
} from '@/lib/navigation';
import { filterPortalConfigForLaunchModules } from '@/lib/launch-modules';

// Preserve the original Examination Cell destinations and the new account links.
const originalPaths = [
  'dashboard', 'live-dashboard', 'calendar', 'my-tasks', 'search', 'student-timeline',
  'sessions', 'deadlines', 'audit-log', 'schedule', 'form-fillup', 'eligibility',
  'hall-ticket-approvals', 'exam-centres', 'admit-cards', 'attendance-exemptions',
  'product-viva', 'seating', 'seating-plans', 'resource-allocation', 'invigilation',
  'print-hub', 'question-papers', 'exam-day', 'answer-sheets', 'documents', 'results',
  'grade-cards', 'approvals/grade-change', 'approvals/dofa-inbox', 'course-grades',
  'backlog-exams', 're-evaluations', 'ufm-cases', 'transcripts', 'portfolio-transcripts',
  'degree-audit', 'reports', 'analytics', 'notifications', 'settings', 'profile',
].map((path) => `/exam-cell/${path}`);

describe('Examination Cell navigation', () => {
  it('restores the original sidebar groups and specialist ordering', () => {
    expect(examCellPortal.navGroups.map((group) => group.title)).toEqual([
      'Overview',
      'Pre-Exam Operations',
      'Post-Exam Operations',
      'My HR & Operations',
    ]);
    expect(examCellPortal.navGroups.map((group) => group.items.length)).toEqual([9, 17, 14, 3]);
    expect(collectNavHrefs(examCellPortal.navGroups.slice(0, 3))).toEqual([
      '/exam-cell/dashboard', '/exam-cell/live-dashboard', '/exam-cell/calendar',
      '/exam-cell/my-tasks', '/exam-cell/search', '/exam-cell/student-timeline',
      '/exam-cell/sessions', '/exam-cell/deadlines', '/exam-cell/audit-log',
      '/exam-cell/schedule', '/exam-cell/form-fillup', '/exam-cell/eligibility',
      '/exam-cell/hall-ticket-approvals', '/exam-cell/exam-centres', '/exam-cell/admit-cards',
      '/exam-cell/attendance-exemptions', '/exam-cell/product-viva', '/exam-cell/seating',
      '/exam-cell/seating-plans', '/exam-cell/resource-allocation', '/exam-cell/invigilation',
      '/exam-cell/print-hub', '/exam-cell/question-papers', '/exam-cell/exam-day',
      '/exam-cell/answer-sheets', '/exam-cell/documents', '/exam-cell/results',
      '/exam-cell/grade-cards', '/exam-cell/approvals/grade-change', '/exam-cell/approvals/dofa-inbox',
      '/exam-cell/course-grades', '/exam-cell/backlog-exams', '/exam-cell/re-evaluations',
      '/exam-cell/ufm-cases', '/exam-cell/transcripts', '/exam-cell/portfolio-transcripts',
      '/exam-cell/degree-audit', '/exam-cell/reports', '/exam-cell/analytics', '/exam-cell/notifications',
    ]);
  });

  it('keeps the primary workflow routes available exactly once', () => {
    const hrefs = collectNavHrefs(examCellPortal.navGroups);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(43);
    hrefs.forEach((href) => expect(existsSync(join(process.cwd(), 'src/app/(portals)', href, 'page.tsx'))).toBe(true));
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
    ]));
  });

  it('restores Account settings without duplicating it and keeps the profile route', () => {
    const config = withAccountSettingsNav(examCellPortal);
    expect(config.navGroups.map((group) => group.title)).toEqual([
      'Overview', 'Pre-Exam Operations', 'Post-Exam Operations', 'My HR & Operations', 'Account',
    ]);
    const hrefs = collectNavHrefs(config.navGroups);
    expect(hrefs).toHaveLength(44);
    expect(hrefs.filter((href) => href === '/exam-cell/settings')).toHaveLength(1);
    expect(withAccountSettingsNav(config)).toBe(config);
    expect(existsSync(join(process.cwd(), 'src/app/(portals)/exam-cell/profile/page.tsx'))).toBe(true);
  });
});

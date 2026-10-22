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
  it('uses eight consolidated sections', () => {
    expect(examCellPortal.navGroups.map((group) => group.title)).toEqual([
      'Dashboard', 'Exam Planning', 'Students & Eligibility', 'Admit Cards',
      'Exam Operations', 'Marks & Results', 'Reports & Compliance', 'Master Data & Settings',
    ]);
  });

  it('preserves every destination exactly once without changing access metadata', () => {
    const items = examCellPortal.navGroups.flatMap((group) => group.items);
    expect(items.map((item) => item.href).sort()).toEqual([...originalPaths].sort());
    // The original Exam Cell entries have no item-level role/module overrides.
    for (const item of items) {
      expect(item.roles).toBeUndefined();
      expect(item.moduleKey).toBeUndefined();
      expect(item.hrModule).toBeUndefined();
    }
  });

  it('keeps clear labels on the original routes', () => {
    const labels = Object.fromEntries(
      examCellPortal.navGroups.flatMap((group) => group.items).map((item) => [item.href, item.label]),
    );
    expect(labels).toMatchObject({
      '/exam-cell/dashboard': 'Command Center',
      '/exam-cell/form-fillup': 'Form Fill-up Desk',
      '/exam-cell/admit-cards': 'Admit Card Engine',
      '/exam-cell/approvals/grade-change': 'Grade Change DOFA',
      '/exam-cell/approvals/dofa-inbox': 'DOFA Inbox (Universal)',
      '/exam-cell/ufm-cases': 'UFM Malpractice Desk',
    });
  });

  it('retains existing quick-navigation destinations and order', () => {
    expect(examCellPortal.commandItems.map((item) => item.href)).toEqual([
      '/exam-cell/dashboard', '/exam-cell/schedule', '/exam-cell/admit-cards',
      '/exam-cell/attendance-exemptions', '/exam-cell/results', '/exam-cell/grade-cards',
      '/exam-cell/approvals/grade-change', '/exam-cell/ufm-cases',
    ]);
  });

  it('does not duplicate Settings or the approval inbox', () => {
    const withInbox = withRoleAwareDofaInboxNav(examCellPortal, '/exam-cell/approvals/dofa-inbox');
    expect(withInbox).toBe(examCellPortal);
    const config = withAccountSettingsNav(filterPortalConfigForLaunchModules(withInbox, null));
    expect(config.navGroups).toHaveLength(8);
    const account = config.navGroups[config.navGroups.length - 1];
    expect(account.title).toBe('Master Data & Settings');
    expect(account.items.filter((item) => item.href === '/exam-cell/settings')).toHaveLength(1);
  });

  it('keeps search keywords on key destinations', () => {
    const items = examCellPortal.navGroups.flatMap((group) => group.items);
    expect(items.find((item) => item.href === '/exam-cell/dashboard')?.keywords).toContain('dashboard');
    expect(items.find((item) => item.href === '/exam-cell/approvals/dofa-inbox')?.keywords).toContain('approvals');
  });
});

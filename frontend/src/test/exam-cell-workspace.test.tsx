import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamCellWorkspace } from '@/components/exam-cell/ExamCellWorkspace';
import { examCellPortal } from '@/lib/navigation';

const route = vi.hoisted(() => ({ pathname: '/exam-cell/schedule' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

describe('Examination Cell workspaces', () => {
  beforeEach(() => {
    route.pathname = '/exam-cell/schedule';
  });

  it.each(examCellPortal.navGroups.flatMap((group) => group.items.map((item) => [group.title, item.href])))('preserves %s workflow %s and its active tab', (title, href) => {
    route.pathname = `${href}/details`;
    render(<ExamCellWorkspace><h1>Existing workflow</h1></ExamCellWorkspace>);
    const nav = screen.getByRole('navigation', { name: `${title} pages` });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')).toHaveAttribute('href', href);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Existing workflow' })).toBeTruthy();
  });
  it('opens planning deep links with related pages as tabs and keeps page content', () => {
    render(<ExamCellWorkspace><h1>Schedule form</h1></ExamCellWorkspace>);
    expect(screen.getByRole('heading', { name: 'Schedule form' })).toBeTruthy();
    const links = screen.getByRole('navigation', { name: 'Exam Planning pages' });
    expect(links.querySelector('[aria-current="page"]')).toHaveAttribute('href', '/exam-cell/schedule');
    expect(screen.getByRole('link', { name: 'Examination Calendar' })).toHaveAttribute('href', '/exam-cell/calendar');
    expect(screen.getByRole('link', { name: 'Deadlines' })).toHaveAttribute('href', '/exam-cell/deadlines');
  });

  it('preserves specialized approval and account pages in their workspace', () => {
    route.pathname = '/exam-cell/approvals/grade-change';
    const { rerender } = render(<ExamCellWorkspace>Approvals</ExamCellWorkspace>);
    expect(screen.getByRole('navigation', { name: 'Marks & Results pages' }).querySelector('[aria-current="page"]'))
      .toHaveAttribute('href', '/exam-cell/approvals/grade-change');
    route.pathname = '/exam-cell/profile';
    rerender(<ExamCellWorkspace>Account details</ExamCellWorkspace>);
    expect(screen.getByRole('navigation', { name: 'Master Data & Settings pages' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/exam-cell/settings');
  });
});

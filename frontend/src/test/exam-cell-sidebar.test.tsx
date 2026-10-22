import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { examCellPortal, financePortal } from '@/lib/navigation';

const route = vi.hoisted(() => ({ pathname: '/exam-cell/results' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
beforeEach(() => { route.pathname = '/exam-cell/results'; });

const landings = [
  '/exam-cell/dashboard', '/exam-cell/schedule', '/exam-cell/eligibility', '/exam-cell/admit-cards',
  '/exam-cell/exam-day', '/exam-cell/results', '/exam-cell/reports', '/exam-cell/exam-centres',
];

describe('Examination Cell sidebar', () => {
  it.each([false, true])('renders exactly eight primary links, collapsed=%s', (collapsed) => {
    render(<AppSidebar personaLabel={examCellPortal.personaLabel} navGroups={examCellPortal.navGroups} collapsed={collapsed} onToggleCollapse={() => {}} />);
    const navigation = screen.getByRole('navigation', { name: 'Workspace modules' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(8);
    examCellPortal.navGroups.forEach((group, index) => {
      expect(within(navigation).getByRole('link', { name: group.title, exact: true })).toHaveAttribute('href', landings[index]);
    });
    const active = within(navigation).getByRole('link', { name: 'Marks & Results' });
    expect(active).toHaveAttribute('aria-current', 'location');
    expect(active).toHaveClass('bg-sgvu-gold');
    expect(navigation.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(navigation.querySelector('details')).toBeNull();
  });

  it.each(examCellPortal.navGroups.flatMap((group) => group.items.map((item) => [group.title, item.href])))('keeps %s active for %s', (title, href) => {
    route.pathname = `${href}/details`;
    render(<AppSidebar personaLabel={examCellPortal.personaLabel} navGroups={examCellPortal.navGroups} collapsed={false} onToggleCollapse={() => {}} />);
    expect(screen.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'location');
  });

  it('falls back to an available child when a section landing is filtered out', () => {
    const group = examCellPortal.navGroups.find((item) => item.title === 'Exam Planning')!;
    const items = group.items.filter((item) => item.href !== '/exam-cell/schedule');
    render(<AppSidebar personaLabel={examCellPortal.personaLabel} navGroups={[{ ...group, items }]} collapsed={false} onToggleCollapse={() => {}} />);
    expect(screen.getByRole('link', { name: 'Exam Planning' })).toHaveAttribute('href', items[0].href);
  });

  it('preserves other portals specialist sidebar navigation', () => {
    route.pathname = financePortal.homeHref;
    render(<AppSidebar personaLabel={financePortal.personaLabel} navGroups={financePortal.navGroups} collapsed={false} onToggleCollapse={() => {}} />);
    expect(within(screen.getByRole('navigation', { name: 'Workspace modules' })).getAllByRole('link'))
      .toHaveLength(financePortal.navGroups.flatMap((group) => group.items).length);
  });
});

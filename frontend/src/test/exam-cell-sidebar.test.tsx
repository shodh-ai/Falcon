import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { examCellPortal, financePortal, withAccountSettingsNav } from '@/lib/navigation';

const route = vi.hoisted(() => ({ pathname: '/exam-cell/results' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
beforeEach(() => { route.pathname = '/exam-cell/results'; });

const config = withAccountSettingsNav(examCellPortal);
const workflows = config.navGroups.flatMap((group) => group.items);

describe('Examination Cell sidebar', () => {
  it.each([false, true])('shows every workflow directly in the sidebar, collapsed=%s', (collapsed) => {
    render(<AppSidebar personaLabel={config.personaLabel} navGroups={config.navGroups} collapsed={collapsed} onToggleCollapse={() => {}} />);
    const navigation = screen.getByRole('navigation', { name: 'Workspace modules' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(44);
    workflows.forEach((item) => {
      expect(within(navigation).getByRole('link', { name: item.label, exact: true })).toHaveAttribute('href', item.href);
    });
    const active = within(navigation).getByRole('link', { name: 'Result Control Centre' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('bg-sgvu-gold');
    expect(navigation.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(navigation.querySelector('details')).toBeNull();
  });

  it.each(workflows.map((item) => [item.label, item.href]))('keeps %s active for %s', (label, href) => {
    route.pathname = `${href}/details`;
    render(<AppSidebar personaLabel={config.personaLabel} navGroups={config.navGroups} collapsed={false} onToggleCollapse={() => {}} />);
    expect(screen.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps permission-filtered workflows out of the restored sidebar', () => {
    const group = examCellPortal.navGroups.find((item) => item.title === 'Pre-Exam Operations')!;
    const items = group.items.filter((item) => item.href !== '/exam-cell/schedule');
    render(<AppSidebar personaLabel={examCellPortal.personaLabel} navGroups={[{ ...group, items }]} collapsed={false} onToggleCollapse={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Master Exam Schedule' })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(16);
    expect(screen.getByRole('link', { name: 'Form Fill-up Desk' })).toHaveAttribute('href', items[0].href);
  });

  it('preserves other portals specialist sidebar navigation', () => {
    route.pathname = financePortal.homeHref;
    render(<AppSidebar personaLabel={financePortal.personaLabel} navGroups={financePortal.navGroups} collapsed={false} onToggleCollapse={() => {}} />);
    expect(within(screen.getByRole('navigation', { name: 'Workspace modules' })).getAllByRole('link'))
      .toHaveLength(financePortal.navGroups.flatMap((group) => group.items).length);
  });
});

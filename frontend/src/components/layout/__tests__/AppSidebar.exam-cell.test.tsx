import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { examCellPortal, facultyPortal, withAccountSettingsNav } from '@/lib/navigation';
import { getExamCellSection } from '@/lib/exam-cell/sections';

const mocks = vi.hoisted(() => ({ pathname: '/exam-cell/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/components/brand/FalconLogo', () => ({ FalconLogo: () => <span>Falcon</span> }));

const config = withAccountSettingsNav(examCellPortal);
const sidebarProps = {
  personaLabel: config.personaLabel,
  navGroups: config.navGroups,
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

describe('Examination Cell consolidated sidebar', () => {
  beforeEach(() => {
    mocks.pathname = '/exam-cell/dashboard';
    vi.clearAllMocks();
  });

  it('shows eight section links and keeps every specialist route in its section', () => {
    render(<AppSidebar {...sidebarProps} />);
    const nav = screen.getByRole('navigation', { name: 'Workspace modules' });
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    for (const group of examCellPortal.navGroups) {
      const landing = group.items.find((item) => item.href === group.homeHref) ?? group.items[0];
      expect(within(nav).getByRole('link', { name: group.title })).toHaveAttribute('href', landing.href);
      for (const item of group.items) {
        expect(getExamCellSection(item.href)?.items.some((candidate) => candidate.href === item.href)).toBe(true);
      }
    }
  });

  it('marks the current section without falsely marking its landing page', () => {
    mocks.pathname = '/exam-cell/course-grades';
    render(<AppSidebar {...sidebarProps} />);
    expect(screen.getByRole('link', { name: 'Marks & Results' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('preserves mobile drawer navigation and collapsed section access', () => {
    const closeDrawer = vi.fn();
    const { rerender } = render(
      <div onClick={(event) => { event.preventDefault(); closeDrawer(); }}>
        <AppSidebar {...sidebarProps} collapsed />
      </div>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(8);
    fireEvent.click(screen.getByRole('link', { name: 'Exam Planning' }));
    expect(closeDrawer).toHaveBeenCalledOnce();
    rerender(<AppSidebar {...sidebarProps} />);
    expect(screen.getAllByRole('link')).toHaveLength(8);
  });

  it('leaves other portals as full visible navigation lists', () => {
    mocks.pathname = '/faculty/dashboard';
    render(<AppSidebar {...sidebarProps} personaLabel={facultyPortal.personaLabel} navGroups={facultyPortal.navGroups} />);
    expect(screen.getAllByRole('link')).toHaveLength(facultyPortal.navGroups.flatMap((group) => group.items).length);
  });
});

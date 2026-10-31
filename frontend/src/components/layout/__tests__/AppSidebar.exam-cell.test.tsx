import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { examCellPortal, facultyPortal, withAccountSettingsNav } from '@/lib/navigation';

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

describe('Examination Cell sidebar', () => {
  beforeEach(() => {
    mocks.pathname = '/exam-cell/dashboard';
    vi.clearAllMocks();
  });

  it('shows every specialist route and the HR links in their navigation groups', () => {
    render(<AppSidebar {...sidebarProps} />);
    const nav = screen.getByRole('navigation', { name: 'Workspace modules' });
    const expected = config.navGroups.flatMap((group) => group.items);
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(expected.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expected.map((item) => item.href));
    expect(new Set(expected.map((item) => item.href)).size).toBe(expected.length);
    for (const group of config.navGroups) {
      expect(within(nav).getByText(group.title)).toBeInTheDocument();
    }
  });

  it('marks only the selected specialist route as current', () => {
    mocks.pathname = '/exam-cell/course-grades';
    render(<AppSidebar {...sidebarProps} />);
    expect(screen.getByRole('link', { name: 'Course Grades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Command Center' })).not.toHaveAttribute('aria-current');
  });

  it('keeps all routes available when the sidebar is collapsed', () => {
    render(<AppSidebar {...sidebarProps} collapsed />);
    const nav = screen.getByRole('navigation', { name: 'Workspace modules' });
    expect(within(nav).getAllByRole('link')).toHaveLength(config.navGroups.flatMap((group) => group.items).length);
  });

  it('leaves other portals as full visible navigation lists', () => {
    mocks.pathname = '/faculty/dashboard';
    render(<AppSidebar {...sidebarProps} personaLabel={facultyPortal.personaLabel} navGroups={facultyPortal.navGroups} />);
    expect(screen.getAllByRole('link')).toHaveLength(facultyPortal.navGroups.flatMap((group) => group.items).length);
  });
});

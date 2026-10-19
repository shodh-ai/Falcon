import { fireEvent, render, screen } from '@testing-library/react';
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

describe('Examination Cell always-visible sidebar', () => {
  beforeEach(() => {
    mocks.pathname = '/exam-cell/dashboard';
    vi.clearAllMocks();
  });

  it('shows all 40 links under the seven headings without expanding anything', () => {
    render(<AppSidebar {...sidebarProps} />);
    for (const group of examCellPortal.navGroups) {
      expect(screen.getByText(group.title)).toBeVisible();
      expect(screen.queryByRole('button', { name: group.title })).not.toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByRole('link', { name: item.label })).toBeVisible();
      }
    }
    expect(screen.getAllByRole('link')).toHaveLength(41);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/exam-cell/settings');
  });

  it('retains the reference navy background, gold headings, and rounded gold active item', () => {
    render(<AppSidebar {...sidebarProps} />);
    expect(screen.getByRole('complementary')).toHaveClass('bg-sgvu-navy');
    expect(screen.getByText('Dashboard & Tasks')).toHaveClass('uppercase', 'text-sgvu-gold/80');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('rounded-xl', 'bg-sgvu-gold', 'text-sgvu-navy');
  });

  it('does not hide links when a section heading is clicked', () => {
    render(<AppSidebar {...sidebarProps} />);
    fireEvent.click(screen.getByText('Results & Corrections'));
    expect(screen.getByRole('link', { name: 'Result Control Centre' })).toHaveAttribute('href', '/exam-cell/results');
    expect(screen.getAllByRole('link')).toHaveLength(41);
    for (const list of screen.getAllByRole('list')) expect(list).not.toHaveAttribute('hidden');
  });

  it('keeps every section visible while updating the active link after navigation', () => {
    mocks.pathname = '/exam-cell/results/session-123';
    const { rerender } = render(<AppSidebar {...sidebarProps} />);
    expect(screen.getByRole('link', { name: 'Result Control Centre' })).toHaveAttribute('aria-current', 'page');
    mocks.pathname = '/exam-cell/course-grades';
    rerender(<AppSidebar {...sidebarProps} />);
    expect(screen.getAllByRole('link')).toHaveLength(41);
    expect(screen.getByRole('link', { name: 'Course Grades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Exam Sessions' })).toBeVisible();
  });

  it('preserves mobile drawer navigation when a visible link is clicked', () => {
    const closeDrawer = vi.fn();
    render(
      <div onClick={(event) => { event.preventDefault(); closeDrawer(); }}>
        <AppSidebar {...sidebarProps} />
      </div>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Exam Sessions' }));
    expect(closeDrawer).toHaveBeenCalledOnce();
  });

  it('keeps all 40 destinations plus Settings accessible in icon-only mode', () => {
    const { rerender } = render(<AppSidebar {...sidebarProps} collapsed />);
    expect(screen.getAllByRole('link')).toHaveLength(41);
    expect(screen.getByTitle('Grade Change DOFA')).toHaveAttribute('href', '/exam-cell/approvals/grade-change');
    expect(screen.queryByRole('button', { name: 'Results & Corrections' })).not.toBeInTheDocument();
    rerender(<AppSidebar {...sidebarProps} />);
    expect(screen.getAllByRole('link')).toHaveLength(41);
    expect(screen.getByRole('link', { name: 'Result Control Centre' })).toBeVisible();
  });

  it('leaves other portals as static sections with visible navigation links', () => {
    mocks.pathname = '/faculty/dashboard';
    render(<AppSidebar {...sidebarProps} personaLabel={facultyPortal.personaLabel} navGroups={facultyPortal.navGroups} />);
    expect(screen.getAllByRole('link')).toHaveLength(facultyPortal.navGroups.flatMap((group) => group.items).length);
    for (const group of facultyPortal.navGroups) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: group.title })).not.toBeInTheDocument();
    }
  });
});

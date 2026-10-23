import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyDashboardWorkspace } from '../FacultyDashboardWorkspace';

type DutyFixture = {
  assignment_id: string;
  exam_name: string;
  exam_date?: string;
  room: string;
  excuse_status?: 'APPROVED' | 'PENDING' | 'REJECTED';
};

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() },
  meetingsList: vi.fn(),
  user: { user_id: 'faculty-test', name: 'Test Faculty', role: 'Faculty' },
  duties: [] as DutyFixture[],
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: fixtures.user, token: null }),
}));
vi.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    AlertTriangle: Icon, CalendarClock: Icon, CalendarDays: Icon,
    CheckCircle2: Icon, ClipboardCheck: Icon, ClipboardList: Icon,
    GraduationCap: Icon, Mail: Icon, Sparkles: Icon, X: Icon,
  };
});
vi.mock('@/lib/faculty-manager-access', () => ({ canSeeFacultyTeamApprovals: () => false }));
vi.mock('@/components/faculty/TeachingDepartmentContext', () => ({
  useTeachingDepartment: () => ({ activeDeptId: null, loading: false }),
}));
vi.mock('@/components/faculty/MultiDepartmentTeachingSummary', () => ({
  MultiDepartmentTeachingSummary: () => null,
}));
vi.mock('@/lib/api/api.meetings', () => ({
  createMeetingsApi: () => ({ list: fixtures.meetingsList }),
}));
vi.mock('@/lib/api/notifications', () => ({ notificationsApi: { recent: vi.fn() } }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (live: unknown) => live,
}));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyInlineLoading: ({ label }: { label: string }) => <p role="status">{label}</p>,
  FacultyEmptyState: ({ title, description }: { title?: string; description: string }) => (
    <div>{title ? <h3>{title}</h3> : null}<p>{description}</p></div>
  ),
  FacultyErrorBanner: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}));

function duty(id: string, date?: string): DutyFixture {
  return { assignment_id: id, exam_name: `Exam ${id}`, exam_date: date, room: 'A-101' };
}

function upcomingEvents() {
  return within(screen.getByRole('heading', { name: 'Upcoming Events' }).closest('section')!);
}

function dutyTask() {
  return screen.getByRole('link', { name: /Exam Paper \/ Duty Prep/ });
}

async function renderLoadedDashboard() {
  render(<FacultyDashboardWorkspace />);
  await waitFor(() => expect(screen.queryByText('Loading schedule…')).not.toBeInTheDocument());
  expect(fixtures.api.get).toHaveBeenCalledWith('/api/academics/faculty/workspaces/invigilation');
}

describe('faculty dashboard exam duty calendar dates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0));
    vi.clearAllMocks();
    fixtures.user = { user_id: 'faculty-test', name: 'Test Faculty', role: 'Faculty' };
    fixtures.duties = [];
    fixtures.meetingsList.mockResolvedValue([]);
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/academics/faculty/workspaces/invigilation') return fixtures.duties;
      if (path === '/api/academics/proctor/pending-approvals') return { certificates: [] };
      if (path === '/api/hr/workforce/today') return { today: null, week_hours: 0 };
      if (path === '/api/academics/faculty/profile/compliance') {
        return { needs_academic_profile: false, message: null };
      }
      if (path === '/api/academics/faculty/profile') return { name: 'Test Faculty' };
      return [];
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refetches daily teaching and HR data when its clock crosses local midnight', async () => {
    // The shared setup fakes Date only. Vitest ignores a second installation
    // while that clock is active, so restore it before installing interval fakes.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 19, 23, 59, 30));
    await renderLoadedDashboard();
    const reads = (path: string) => fixtures.api.get.mock.calls.filter(([url]) => url === path).length;
    expect(reads('/api/academics/faculty/timetable/today')).toBe(1);
    expect(reads('/api/hr/workforce/today')).toBe(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reads('/api/academics/faculty/timetable/today')).toBe(2);
    expect(reads('/api/academics/faculty/attendance/missing')).toBe(2);
    expect(reads('/api/hr/workforce/today')).toBe(2);
    expect(screen.getByText(/Tuesday,? (?:20 October|October 20),? 2026/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reads('/api/academics/faculty/timetable/today')).toBe(2);
  });

  it('keeps the dashboard usable and dismisses the compliance notice when browser storage is blocked', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError'); });
    const read = fixtures.api.get.getMockImplementation()!;
    fixtures.api.get.mockImplementation((path: string) => path === '/api/academics/faculty/profile/compliance'
      ? Promise.resolve({ needs_academic_profile: true, message: 'Complete your profile details.' })
      : read(path));
    try {
      await renderLoadedDashboard();
      expect(screen.getByText('Complete your Academic Profile')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText('Complete your Academic Profile')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Good Afternoon, Test Faculty/ })).toBeInTheDocument();
      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalledWith('faculty-profile-compliance-dismissed', '1');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('hides the previous account dashboard immediately while the next account data is loading', async () => {
    const view = render(<FacultyDashboardWorkspace />);
    await screen.findByRole('heading', { name: /Good Afternoon, Test Faculty/ });
    await waitFor(() => expect(screen.queryByText('Loading schedule…')).not.toBeInTheDocument());
    let resolve!: (value: { name: string }) => void;
    const pendingProfile = new Promise<{ name: string }>((done) => { resolve = done; });
    const oldGet = fixtures.api.get.getMockImplementation()!;
    fixtures.api = {
      get: vi.fn((path: string) => path === '/api/academics/faculty/profile' ? pendingProfile : oldGet(path)),
      patch: vi.fn(),
    };
    fixtures.user = { user_id: 'faculty-next', name: 'Next Faculty', role: 'Faculty' };
    view.rerender(<FacultyDashboardWorkspace />);
    expect(screen.queryByRole('heading', { name: /Good Afternoon, Test Faculty/ })).not.toBeInTheDocument();
    expect(screen.getByText('Loading schedule…')).toBeInTheDocument();
    await act(async () => { resolve({ name: 'Next Faculty' }); });
    expect(screen.getByRole('heading', { name: /Good Afternoon, Next Faculty/ })).toBeInTheDocument();
  });

  it('excludes past and invalid dates, keeps today, and sorts upcoming duties by their calendar day', async () => {
    fixtures.duties = [
      duty('later', '2026-10-25'),
      duty('past', '2026-10-18'),
      duty('invalid', '2026-02-30'),
      duty('today', '2026-10-19'),
      duty('missing'),
      duty('tomorrow', '2026-10-20'),
      duty('unparseable', 'not-a-date'),
    ];

    await renderLoadedDashboard();

    const eventLinks = upcomingEvents().getAllByRole('link');
    expect(eventLinks).toHaveLength(3);
    expect(eventLinks.map((link) => within(link).getByText(/^Exam (today|tomorrow|later)$/).textContent))
      .toEqual(['Exam today', 'Exam tomorrow', 'Exam later']);
    expect(screen.queryByText('Exam past')).not.toBeInTheDocument();
    expect(screen.queryByText('Exam invalid')).not.toBeInTheDocument();
    expect(screen.queryByText('Exam missing')).not.toBeInTheDocument();
    expect(screen.queryByText('Exam unparseable')).not.toBeInTheDocument();
    expect(dutyTask()).toHaveTextContent('3 upcoming exam duties on your roster');
    expect(dutyTask()).toHaveTextContent('19 Oct 2026');
    expect(eventLinks[0]).toHaveTextContent('Exam · 19 Oct 2026 · Room A-101');
  });

  it('counts every upcoming duty for preparation while displaying only the earliest five events', async () => {
    fixtures.duties = [
      duty('day-25', '2026-10-25'),
      duty('day-22', '2026-10-22'),
      duty('day-19', '2026-10-19'),
      duty('day-24', '2026-10-24'),
      duty('day-20', '2026-10-20'),
      duty('day-23', '2026-10-23'),
      duty('day-21', '2026-10-21'),
    ];

    await renderLoadedDashboard();

    expect(dutyTask()).toHaveTextContent('7 upcoming exam duties on your roster');
    const eventLinks = upcomingEvents().getAllByRole('link');
    expect(eventLinks).toHaveLength(5);
    expect(eventLinks.map((link) => within(link).getByText(/^Exam day-/).textContent))
      .toEqual(['Exam day-19', 'Exam day-20', 'Exam day-21', 'Exam day-22', 'Exam day-23']);
    expect(upcomingEvents().queryByText('Exam day-24')).not.toBeInTheDocument();
    expect(upcomingEvents().queryByText('Exam day-25')).not.toBeInTheDocument();
  });

  it('retains the written calendar date for legacy ISO exam dates in events and preparation tasks', async () => {
    fixtures.duties = [duty('legacy', '2026-10-19T23:30:00-04:00')];

    await renderLoadedDashboard();

    expect(upcomingEvents().getByRole('link', { name: /Exam legacy/ }))
      .toHaveTextContent('Exam · 19 Oct 2026 · Room A-101');
    expect(dutyTask()).toHaveTextContent('1 upcoming exam duty on your roster');
    expect(dutyTask()).toHaveTextContent('19 Oct 2026');
  });

  it('excludes approved duty excuses while keeping pending and rejected requests assigned', async () => {
    fixtures.duties = [
      { ...duty('approved-excuse', '2026-10-19'), excuse_status: 'APPROVED' },
      { ...duty('rejected-excuse', '2026-10-21'), excuse_status: 'REJECTED' },
      { ...duty('pending-excuse', '2026-10-20'), excuse_status: 'PENDING' },
    ];

    await renderLoadedDashboard();

    expect(screen.queryByText('Exam approved-excuse')).not.toBeInTheDocument();
    expect(dutyTask()).toHaveTextContent('2 upcoming exam duties on your roster');
    expect(dutyTask()).toHaveTextContent('20 Oct 2026');
    const eventLinks = upcomingEvents().getAllByRole('link');
    expect(eventLinks.map((link) => within(link).getByText(/^Exam (pending|rejected)-excuse$/).textContent))
      .toEqual(['Exam pending-excuse', 'Exam rejected-excuse']);
  });

  it('clears exam preparation when only old or invalid dates are returned', async () => {
    fixtures.duties = [duty('past', '2026-10-18'), duty('invalid', '2026-13-01')];

    await renderLoadedDashboard();

    expect(dutyTask()).toHaveTextContent('No upcoming invigilation duties');
    expect(dutyTask()).toHaveTextContent('Cleared');
    expect(upcomingEvents().queryAllByRole('link')).toHaveLength(0);
    expect(upcomingEvents().getByText('No upcoming meetings or exam duties in your queue.'))
      .toBeInTheDocument();
    expect(fixtures.api.patch).not.toHaveBeenCalled();
  });
});

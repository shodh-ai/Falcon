import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyGradingPage from '@/app/(portals)/faculty/grading/page';
import FacultyCourseWorkspacePage from '@/app/(portals)/faculty/courses/[courseId]/page';
import FacultyAttendancePage from '@/app/(portals)/faculty/attendance/page';
import FacultyTimetablePage from '@/app/(portals)/faculty/timetable/page';
import FacultyWeeklyTestsPage from '@/app/(portals)/faculty/weekly-tests/page';
import GradeChangePage from '@/app/(portals)/faculty/grade-change/page';
import { FacultyAssignmentsTab } from '@/components/lms/FacultyAssignmentsTab';
import { FacultyAnnouncementsTab } from '@/components/lms/FacultyAnnouncementsTab';
import { FacultyMaterialsTab } from '@/components/lms/FacultyMaterialsTab';
import { FacultyCourseFeatureHub } from '@/components/faculty/FacultyCourseFeatureHub';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  multipart: vi.fn(),
  courses: [
    { course_id: '11111111-1111-4111-8111-111111111111', course_code: 'CS101', course_name: 'Algorithms', credits: 3 },
    { course_id: '22222222-2222-4222-8222-222222222222', course_code: 'CS102', course_name: 'Databases', credits: 3 },
  ],
}));
const courseId = fixtures.courses[0].course_id;
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'mock-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/api/lms', () => ({ postMultipart: fixtures.multipart, patchMultipart: fixtures.multipart, downloadWithAuth: vi.fn() }));
vi.mock('@/components/lms/LmsExtendedTabs', () => ({ LmsExtendedTabs: () => null }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/faculty/courses',
  useParams: () => ({ courseId: fixtures.courses[0].course_id }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/select', () => ({ Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({
  useFacultyCourses: () => ({ courses: fixtures.courses, loading: false, error: null }),
  uniqueFacultyCoursesByCourseId: (courses: unknown[]) => courses,
}));
vi.mock('@/components/faculty/TeachingDepartmentContext', () => ({
  useTeachingDepartment: () => ({ activeDeptId: null, loading: false }),
  useOptionalTeachingDepartment: () => null,
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoEntityId: () => false,
  isFacultyDemoSmokeId: () => false,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

const assignment = {
  assignment_id: 'assignment-1', title: 'Array practice', max_marks: 10,
  start_date: '2025-01-01T00:00:00Z', due_date: '2030-01-01T00:00:00Z',
};
const student = { student_user_id: 'student-1', name: 'Test Student', roll_number: 'A001' };
const workspace = { course: fixtures.courses[0], modules: [], syllabus_configured: false };

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api.get.mockReset().mockResolvedValue([]);
  fixtures.api.post.mockReset().mockResolvedValue({});
  fixtures.multipart.mockReset().mockResolvedValue({});
  localStorage.clear();
});
afterEach(cleanup);

describe('faculty grade publication', () => {
  async function openLedger(marks: Record<string, { obtained: number; status: string }>) {
    fixtures.api.get.mockResolvedValue([{ ...student, marks }]);
    render(<FacultyGradingPage />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: courseId } });
    await screen.findByText(student.name);
  }

  it('does not publish older saved marks when saving the current edits fails', async () => {
    await openLedger({ GA1: { obtained: 5, status: 'DRAFT' } });
    fixtures.api.post.mockRejectedValueOnce(new Error('Draft save unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish All Marks' }));
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Draft save unavailable'));
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post.mock.calls[0][0]).toContain('/marks/draft');
    expect(screen.getByRole('button', { name: 'Publish All Marks' })).toBeEnabled();
  });

  it('keeps publication locked while publishing, and allows auto-synced marks without a draft', async () => {
    await openLedger({ WT1: { obtained: 8, status: 'DRAFT' } });
    const pending = deferred<{ published: number }>();
    fixtures.api.post.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Publish All Marks' }));
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledTimes(1));
    expect(fixtures.api.post.mock.calls[0][0]).toContain('/publish-all');
    expect(screen.getByRole('button', { name: 'Publish All Marks' })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    await act(async () => { pending.resolve({ published: 1 }); });
  });

  it('rejects negative manual marks before sending a draft', async () => {
    await openLedger({ GA1: { obtained: 5, status: 'DRAFT' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '-1' } });
    expect(fixtures.toast.error).toHaveBeenCalledWith(expect.stringContaining('between 0'));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(5);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});

describe('faculty course workspaces', () => {
  it('ends the loading state on a workspace failure and can retry an empty valid workspace', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Workspace unavailable')).mockResolvedValue(workspace);
    render(<FacultyCourseWorkspacePage />);
    await screen.findByText('Workspace unavailable');
    expect(screen.queryByText('Loading course workspace…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('No units yet');
  });

  it('clears an old course submission roster when switching assignment courses', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/roster')) return { roster: [{ student_user_id: 'student-1', student_name: 'Student from first course', submitted: false, submission_id: null, marks_awarded: null, status: 'NOT_SUBMITTED' }] };
      return path.includes(fixtures.courses[1].course_id) ? [] : [assignment];
    });
    render(<FacultyCourseFeatureHub feature="assignments" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Work here' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Array practice/ }));
    await screen.findByText('Student from first course');
    fireEvent.click(screen.getAllByRole('button', { name: 'Work here' })[1]);
    await screen.findByText('No digital assignments yet');
    expect(screen.queryByText('Student from first course')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back to assignments/ })).not.toBeInTheDocument();
  });

  it('rejects assignment marks outside the assignment maximum', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/roster') ? {
      roster: [{ student_user_id: 'student-1', student_name: 'Test Student', submitted: true, submission_id: 'submission-1', marks_awarded: '4', status: 'SUBMITTED' }],
    } : [assignment]);
    render(<FacultyAssignmentsTab courseId={courseId} />);
    fireEvent.click(await screen.findByRole('button', { name: /Array practice/ }));
    fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(fixtures.toast.error).toHaveBeenCalledWith('Enter marks between 0 and 10');
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('blocks material publishing until its section choices are available', async () => {
    fixtures.api.get.mockRejectedValue(new Error('Publishing sections unavailable'));
    const view = render(<FacultyMaterialsTab courseId={courseId} workspace={{ ...workspace, modules: [{ module_id: 'unit-1', module_number: 1, title: 'Unit one', status: 'PENDING', materials: [] }] }} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload notes' }));
    await screen.findByText('Publishing sections unavailable');
    const fileInput = view.container.querySelector('input[multiple]')!;
    fireEvent.change(fileInput, { target: { files: [new File(['notes'], 'notes.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('button', { name: 'Upload 1' })).toBeDisabled();
    fireEvent.submit(fileInput.closest('form')!);
    expect(fixtures.multipart).not.toHaveBeenCalled();
  });
});

describe('faculty read failures are distinguishable from empty records', () => {
  it.each([
    ['assignments', () => <FacultyAssignmentsTab courseId={courseId} />, 'No digital assignments yet'],
    ['announcements', () => <FacultyAnnouncementsTab courseId={courseId} />, 'No announcements yet'],
    ['weekly tests', () => <FacultyWeeklyTestsPage />, "You haven't scheduled any tests yet."],
    ['grade changes', () => <GradeChangePage />, 'No requests yet'],
    ['timetable', () => <FacultyTimetablePage />, 'No active courses or timetable slots are assigned yet.'],
    ['attendance', () => <FacultyAttendancePage />, 'No classes today'],
  ])('shows a failed %s read', async (_section, page, emptyMessage) => {
    fixtures.api.get.mockRejectedValue(new Error('Read service unavailable'));
    render(page());
    await screen.findByText('Read service unavailable');
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('does not display synthetic attendance analytics when the real roster fails', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('/timetable/today')) return [{ timetable_id: 'slot-1', course_id: courseId, course_code: 'CS101', course_name: 'Algorithms', start_time: '09:00', end_time: '10:00', room: 'A1', student_count: 1 }];
      throw new Error('Roster unavailable');
    });
    render(<FacultyAttendancePage />);
    await screen.findByText('Roster unavailable');
    expect(screen.queryByText('Danger Zone: Below 75%')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).not.toBeInTheDocument();
  });

  it('loads an assigned weekly course when there is no class scheduled today', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('/timetable/today')) return [];
      if (path.includes('/workspaces/timetable')) {
        return [{
          timetable_id: 'weekly-slot-1',
          course_id: courseId,
          course_code: 'CS101',
          course_name: 'Algorithms',
          day_of_week: 1,
          start_time: '09:00',
          end_time: '10:00',
          room: 'A1',
        }];
      }
      if (path.endsWith('/students')) return [{ student_id: 'student-1', name: 'Test Student', roll_number: 'A001' }];
      if (path.includes('/analytics')) return null;
      return { locked: false, attendance_data: null };
    });
    render(<FacultyAttendancePage />);
    await screen.findByText('Available courses');
    await screen.findByText('Test Student');
  });

  it('refreshes the saved attendance session using its timetable id', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.includes('/timetable/today')) return [{ timetable_id: 'slot-1', course_id: courseId, course_code: 'CS101', course_name: 'Algorithms', start_time: '09:00', end_time: '10:00', room: 'A1', student_count: 1 }];
      if (path.endsWith('/students')) return [{ student_id: 'student-1', name: 'Test Student', roll_number: 'A001' }];
      if (path.includes('/analytics')) return null;
      return { locked: false, attendance_data: null };
    });
    fixtures.api.post.mockResolvedValue({ saved: 1, attendance_updated: [{ attendance_percent: '100' }] });
    render(<FacultyAttendancePage />);
    await screen.findByText('Test Student');
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }));
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save attendance' })).toBeEnabled());
    const stateRequests = fixtures.api.get.mock.calls.filter(([path]) => String(path).includes('/attendance?'));
    expect(stateRequests).toHaveLength(2);
    expect(stateRequests.every(([path]) => String(path).includes('timetableId=slot-1'))).toBe(true);
  });
});

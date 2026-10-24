import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentEnterpriseDashboard } from '@/components/student/StudentEnterpriseDashboard';
import { StudentMarksWorkspace } from '@/components/student/StudentMarksWorkspace';
import StudentAttendancePage from '@/app/(portals)/student/attendance/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  token: 'student-a',
  demoMode: false,
  disabled: new Set<string>(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: mocks.token, user: { name: 'Student A', role: 'Student' } }),
}));
vi.mock('@/context/ModuleRuntimeContext', () => ({
  useModuleRuntime: () => ({
    manifest: null,
    module: (key: string) => ({ available: !mocks.disabled.has(key) }),
  }),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => mocks.demoMode }));
vi.mock('@/hooks/useNotifications', () => ({
  useNotificationHistory: () => ({ notifications: [], refresh: vi.fn() }),
  toAppNotification: (value: unknown) => value,
}));
vi.mock('@/components/dashboard/NoticeBoardWidget', () => ({ NoticeBoardWidget: () => null }));
vi.mock('@/components/student/StudentAvatar', () => ({ StudentAvatar: () => null }));
vi.mock('@/components/student/StudentIdCardDialog', () => ({ StudentIdCardDialog: () => null }));

function subjectAttendance(semester: number, present: number, total: number, code = `TEST-${semester}01`) {
  return {
    course_code: code,
    course_name: `Semester ${semester} test subject`,
    semester,
    // Stored percentages are deliberately stale: only actual class counts count.
    attendance_percent: '50',
    status: 'ENROLLED',
    present_count: present,
    absent_count: total - present,
    total_classes: total,
  };
}

function attendanceData(subjects = [subjectAttendance(2, 92, 100)], currentSemester = 2) {
  return {
    overall_percent: 50,
    current_semester: currentSemester,
    subject_wise: subjects,
    progression: [],
  };
}

function attendancePanel() {
  const panel = screen.getByRole('heading', { name: 'Attendance', level: 3 }).closest('section');
  if (!panel) throw new Error('Attendance panel is missing');
  return within(panel);
}

function dashboardPanel(name: string) {
  const panel = screen.getByRole('heading', { name, level: 3 }).closest('section');
  if (!panel) throw new Error(`${name} panel is missing`);
  return within(panel);
}

function enrollmentData(currentSemester = 2) {
  return {
    current_semester: currentSemester,
    enrollments: [
      { enrollment_id: 'old-enrollment', semester: 1, status: 'COMPLETED', course: { course_id: 'old-course', course_code: 'OLD-101', course_name: 'Past semester subject', credits: 4 } },
      { enrollment_id: 'current-enrollment', semester: currentSemester, status: 'ENROLLED', course: { course_id: 'current-course', course_code: 'CURRENT-201', course_name: 'Current semester subject', credits: 4 } },
      { enrollment_id: 'other-current-enrollment', semester: currentSemester, status: 'ENROLLED', course: { course_id: 'other-current-course', course_code: 'CURRENT-202', course_name: 'Other current semester subject', credits: 4 } },
      { enrollment_id: 'withdrawn-enrollment', semester: currentSemester, status: 'WITHDRAWN', course: { course_id: 'withdrawn-course', course_code: 'WITHDRAWN-203', course_name: 'Withdrawn subject', credits: 4 } },
      { enrollment_id: 'future-enrollment', semester: currentSemester + 1, status: 'ENROLLED', course: { course_id: 'future-course', course_code: 'FUTURE-301', course_name: 'Future semester subject', credits: 4 } },
    ],
  };
}

function semesterGrade(semesterNumber = 2, sgpa: number | null = 8.5) {
  return {
    semester_number: semesterNumber,
    sgpa,
    credits: sgpa === 0 ? 0 : 4,
    credits_earned: sgpa === 0 ? 0 : 4,
    credits_attempted: sgpa == null ? 0 : 4,
    courses: [{
      course_id: `grade-course-${semesterNumber}`,
      course_code: `GRADE-${semesterNumber}01`,
      course_name: `Graded semester ${semesterNumber} subject`,
      course_type: 'CORE',
      credits: 4,
      grade: sgpa == null ? '—' : sgpa === 0 ? 'F' : 'A',
      grade_points: sgpa,
      status: sgpa == null ? 'ENROLLED' : 'COMPLETED',
    }],
  };
}

function marksHistory(semesters = [semesterGrade(1, 9), semesterGrade()]) {
  return {
    cgpa: 8.75,
    total_credits_earned: 8,
    total_credits_attempted: 8,
    total_grade_points: 70,
    total_semesters: 4,
    current_semester: 2,
    semesters,
    component_marks_by_semester: [],
    exam_reports: [],
    grade_cards: [],
    backlogs: { uncleared: [], cleared: [] },
  };
}

function assignmentRow(id: string, courseId: string, status = 'PENDING') {
  return {
    assignment: {
      assignment_id: id,
      title: `Assignment ${id}`,
      course_id: courseId,
      start_date: '2026-01-01T00:00:00.000Z',
      due_date: '2099-10-20T18:29:00.000Z',
      max_marks: 20,
    },
    status,
    submission: null,
  };
}

function timetableRow(id: string, courseId: string) {
  return {
    id,
    course_id: courseId,
    course_name: `Class ${id}`,
    faculty_name: 'Synthetic faculty',
    room_number: 'TEST-101',
    start_time: '09:00',
    end_time: '10:00',
  };
}

function response(path: string) {
  if (path.endsWith('/metrics')) return { cgpa: 8.5, credits_completed: 60, credits_required: 160, attendance_percent: 92 };
  if (path === '/api/student/attendance') return attendanceData();
  if (path === '/api/academics/courses/my-enrollments') return enrollmentData();
  if (path === '/api/academics/marks/history') return marksHistory();
  if (path.endsWith('/profile')) return { name: 'Student A' };
  if (path.endsWith('/finance')) return { total_outstanding: 0, gates: { finance_clear: true } };
  if (path.startsWith('/api/academics/exams/schedule?semester=')) return [];
  if (path.endsWith('/hub')) return { open_drives: [], my_applications: [] };
  return [];
}

describe('Student dashboard reliability', () => {
  beforeEach(() => {
    mocks.token = 'student-a';
    mocks.demoMode = false;
    mocks.disabled.clear();
    mocks.api.get.mockReset().mockImplementation((path: string) => Promise.resolve(response(path)));
  });

  it('removes only the exam summary card and keeps five cards plus the exam details panel', async () => {
    render(<StudentEnterpriseDashboard />);
    const firstCard = await screen.findByRole('link', { name: 'Current semester GPA: 8.50' });
    expect(screen.queryByRole('link', { name: /^Upcoming Exams:/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Scheduled assessments', { exact: true })).not.toBeInTheDocument();
    expect(firstCard.parentElement).toHaveClass('xl:grid-cols-5');
    expect(firstCard.parentElement?.querySelectorAll('a[aria-label]')).toHaveLength(5);
    for (const name of ['Attendance: 92%', 'Degree Progress: 60/160', 'Fee Status: Clear', 'Pending Assignments: 0']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Upcoming Exams', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exam desk' })).toHaveAttribute('href', '/student/exams');
    expect(screen.getByText('No upcoming exams', { exact: true })).toBeInTheDocument();
  });

  it('keeps the greeting and date without the decorative sparkle icon', async () => {
    render(<StudentEnterpriseDashboard />);
    await screen.findByRole('link', { name: 'Current semester GPA: 8.50' });
    const greeting = screen.getByText(/Good (morning|afternoon|evening) ·/);
    expect(greeting.textContent).toMatch(/Good (morning|afternoon|evening) · .+/);
    expect(greeting.closest('p')?.querySelector('svg')).toBeNull();
  });

  it('uses white text while retaining the original badge backgrounds', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('/profile')
      ? { name: 'Student A', program: 'Computer Science', semester: 6, enrollment_no: 'SGVU-2026-1001' }
      : path === '/api/academics/courses/my-enrollments' ? enrollmentData(6)
      : response(path)));
    render(<StudentEnterpriseDashboard />);
    const programBadge = await screen.findByText('Computer Science');
    const semesterBadge = screen.getByText('Semester 6');
    const enrollmentBadge = screen.getByText('ENR SGVU-2026-1001');
    for (const badge of [programBadge, semesterBadge, enrollmentBadge]) {
      expect(badge).toHaveClass('text-white');
      expect(badge).not.toHaveClass('bg-white');
    }
    expect(programBadge).toHaveClass('bg-white/10');
    expect(semesterBadge).toHaveClass('bg-white/10');
    expect(enrollmentBadge).toHaveClass('bg-sgvu-gold/20');
  });

  it('distinguishes failed fee data from a clear ledger and retries the request', async () => {
    mocks.api.get.mockImplementation((path: string) => path.endsWith('/finance')
      ? Promise.reject(new Error('service down')) : Promise.resolve(response(path)));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fees');
    expect(screen.getByRole('link', { name: 'Fee Status: —' })).toHaveTextContent('Fees could not be loaded');
    expect(screen.queryByRole('link', { name: 'Fee Status: Clear' })).toBeNull();
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(response(path)));
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByRole('link', { name: 'Fee Status: Clear' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps unavailable modules out of quick actions and does not claim an empty timetable after a failure', async () => {
    mocks.disabled.add('finance_procurement');
    mocks.api.get.mockImplementation((path: string) => path.endsWith('/today')
      ? Promise.reject(new Error('service down')) : Promise.resolve(response(path)));
    render(<StudentEnterpriseDashboard />);
    expect((await screen.findAllByText('Timetable could not be loaded')).length).toBeGreaterThan(0);
    expect(screen.queryByText('No classes today')).toBeNull();
    expect(screen.queryByRole('link', { name: /Pay Fees/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Fee Status:/ })).toBeNull();
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/student/finance');
  });

  it('never carries one account snapshot into another account while requests are pending', async () => {
    const { rerender } = render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Current semester GPA: 8.50' })).toBeInTheDocument();
    mocks.api.get.mockImplementation(() => new Promise(() => {}));
    mocks.token = 'student-b';
    rerender(<StudentEnterpriseDashboard />);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Current semester GPA: 8.50' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Current semester GPA: —' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Attendance: 92%' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Attendance: —' })).toBeInTheDocument();
    expect(screen.queryByText('92%', { exact: true })).not.toBeInTheDocument();
  });

  it('matches the Attendance page using current-semester marked classes, not stale metrics or other semesters', async () => {
    const data = attendanceData([
      subjectAttendance(1, 0, 20),
      subjectAttendance(2, 1, 2),
      subjectAttendance(2, 2, 2, 'TEST-202'),
      subjectAttendance(2, 2, 2, 'TEST-203'),
      subjectAttendance(3, 0, 30),
    ]);
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/attendance' ? data
        : path.endsWith('/metrics') ? { ...response(path), attendance_percent: 50 }
          : response(path),
    ));
    const dashboard = render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Attendance: 83.33%' })).toBeInTheDocument();
    expect(screen.getAllByText('83.33%', { exact: true })).toHaveLength(2);
    expect(attendancePanel().getByText('83.33%', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Attendance: 50%' })).not.toBeInTheDocument();
    expect(mocks.api.get).toHaveBeenCalledWith('/api/student/attendance');
    expect(screen.getByRole('link', { name: 'Attendance: 83.33%' })).toHaveTextContent('Semester 2');

    dashboard.unmount();
    render(<StudentAttendancePage />);
    expect(await screen.findByText('83.33%', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Semester 2 attendance')).toBeInTheDocument();
  });

  it('weights unequal class counts and calculates needed classes from actual totals', async () => {
    const data = attendanceData([
      subjectAttendance(1, 50, 50),
      subjectAttendance(3, 1, 1),
      subjectAttendance(3, 1, 9, 'TEST-302'),
      subjectAttendance(4, 100, 100),
    ], 3);
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/attendance' ? data
        : path === '/api/academics/courses/my-enrollments' ? enrollmentData(3)
          : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    const card = await screen.findByRole('link', { name: 'Attendance: 20%' });
    expect(card).toHaveTextContent('Semester 3');
    expect(attendancePanel().getByText('20%', { exact: true })).toBeInTheDocument();
    expect(attendancePanel().getByText(/22 consecutive present classes/)).toBeInTheDocument();
    expect(screen.queryByText('55.56%', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('92%', { exact: true })).not.toBeInTheDocument();
  });

  it('shows Not recorded for an unmarked current semester without treating old percentages as real attendance', async () => {
    const data = attendanceData([
      subjectAttendance(1, 10, 10),
      { ...subjectAttendance(2, 0, 0), attendance_percent: '95' },
    ]);
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/attendance' ? data : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    const card = await screen.findByRole('link', { name: 'Attendance: Not recorded' });
    expect(card).toHaveTextContent('Semester 2');
    expect(card).not.toHaveTextContent(/Below|Above|minimum/i);
    expect(attendancePanel().getByText('No classes marked yet')).toBeInTheDocument();
    expect(attendancePanel().getAllByText(/Semester 2/).length).toBeGreaterThan(0);
    expect(attendancePanel().queryByText(/consecutive present|already above/i)).not.toBeInTheDocument();
    expect(screen.queryByText('0%', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('95%', { exact: true })).not.toBeInTheDocument();
  });

  it('does not reuse attendance from another semester when the current semester has no subjects', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/attendance'
        ? attendanceData([subjectAttendance(1, 10, 10)], 4)
        : path === '/api/academics/courses/my-enrollments' ? enrollmentData(4)
          : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Attendance: Not recorded' })).toHaveTextContent('Semester 4');
    expect(attendancePanel().getByText('No classes marked yet')).toBeInTheDocument();
    expect(screen.queryByText('100%', { exact: true })).not.toBeInTheDocument();
  });

  it('distinguishes actual zero attendance from missing attendance', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/attendance'
        ? attendanceData([subjectAttendance(2, 0, 5)]) : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    const card = await screen.findByRole('link', { name: 'Attendance: 0%' });
    expect(card).toHaveTextContent('Below 75% minimum');
    expect(attendancePanel().getByText('0%', { exact: true })).toBeInTheDocument();
    expect(attendancePanel().getByText(/15 consecutive present classes/)).toBeInTheDocument();
    expect(screen.queryByText('No classes marked yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Attendance: Not recorded' })).not.toBeInTheDocument();
  });

  it('isolates attendance failures from academic metrics and retries without substituting stored percentages', async () => {
    mocks.demoMode = true;
    mocks.api.get.mockImplementation((path: string) => path === '/api/student/attendance'
      ? Promise.reject(new Error('database credentials must never appear'))
      : Promise.resolve(response(path)));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Attendance');
    expect(screen.getByRole('link', { name: 'Current semester GPA: 8.50' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attendance: —' })).toHaveTextContent('Attendance could not be loaded');
    expect(attendancePanel().getByText('Attendance could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('92%', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('86.5%', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/database credentials/)).not.toBeInTheDocument();

    mocks.api.get.mockImplementation((path: string) => Promise.resolve(response(path)));
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByRole('link', { name: 'Attendance: 92%' })).toBeInTheDocument();
    expect(attendancePanel().getByText('92%', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  });

  it('keeps verified attendance available when only the academic summary fails', async () => {
    mocks.api.get.mockImplementation((path: string) => path.endsWith('/metrics')
      ? Promise.reject(new Error('academic summary unavailable'))
      : Promise.resolve(response(path)));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Attendance: 92%' })).toBeInTheDocument();
    expect(attendancePanel().getByText('92%', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Degree Progress: —' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Current semester GPA: 8.50' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Academic summary');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Attendance');
  });

  it('does not request attendance or display attendance metrics when academics is disabled', async () => {
    mocks.disabled.add('sis_academics');
    render(<StudentEnterpriseDashboard />);
    await screen.findByRole('link', { name: 'Fee Status: Clear' });
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/student/attendance');
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/academics/dashboard/metrics');
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/academics/marks/history');
    expect(screen.queryByRole('link', { name: /^Attendance:/ })).not.toBeInTheDocument();
    expect(attendancePanel().getByText('Attendance module is unavailable')).toBeInTheDocument();
  });

  it('filters timetable and assignment activity to current ENROLLED courses before applying display limits', async () => {
    const oldAssignments = Array.from({ length: 20 }, (_, index) => assignmentRow(`old-${index}`, 'old-course'));
    const oldClasses = Array.from({ length: 12 }, (_, index) => timetableRow(`old-${index}`, 'old-course'));
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/assignments/my'
        ? [...oldAssignments, assignmentRow('future', 'future-course'), assignmentRow('withdrawn', 'withdrawn-course'), assignmentRow('current', 'current-course')]
        : path.endsWith('/timetable/today')
          ? [...oldClasses, timetableRow('future', 'future-course'), timetableRow('withdrawn', 'withdrawn-course'), timetableRow('current', 'current-course')]
          : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByText('Assignment current')).toBeInTheDocument();
    expect(dashboardPanel("Today's Schedule").getByText('Current semester subject')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Assignments: 1' })).toHaveTextContent('Semester 2');
    expect(dashboardPanel('Pending Assignments').getByText(/Semester 2/)).toBeInTheDocument();
    expect(dashboardPanel("Today's Schedule").getByText(/Semester 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Assignment (old-|future|withdrawn)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Class (old-|future|withdrawn)/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Submit' })).toHaveAttribute('href', '/student/courses/current-course');
  });

  it('shows only real enrolled current-semester subjects and derives a non-default semester from the enrollment API', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/courses/my-enrollments' ? enrollmentData(5) : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith('/api/academics/exams/schedule?semester=5'));
    const panel = dashboardPanel('Current Semester Courses');
    expect(panel.getByText(/Semester 5/)).toBeInTheDocument();
    expect(panel.getByText('Current semester subject')).toBeInTheDocument();
    expect(panel.getByText('Other current semester subject')).toBeInTheDocument();
    expect(panel.queryByText('Past semester subject')).not.toBeInTheDocument();
    expect(panel.queryByText('Future semester subject')).not.toBeInTheDocument();
    expect(panel.queryByText('Withdrawn subject')).not.toBeInTheDocument();
    expect(panel.getByRole('link', { name: /Current semester subject/ })).toHaveAttribute('href', '/student/courses/current-course');
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/academics/exams/schedule?semester=2');
  });

  it('counts all pending current-semester assignments while limiting only the displayed rows', async () => {
    const currentAssignments = Array.from({ length: 13 }, (_, index) => assignmentRow(`current-${index}`, 'current-course'));
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/assignments/my'
        ? [assignmentRow('past', 'old-course'), ...currentAssignments, assignmentRow('future', 'future-course')]
        : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Pending Assignments: 13' })).toBeInTheDocument();
    const panel = dashboardPanel('Pending Assignments');
    expect(panel.getAllByRole('link', { name: 'Submit' })).toHaveLength(12);
    expect(panel.getAllByText(/^Assignment current-/)).toHaveLength(12);
    expect(panel.queryByText('Assignment current-12')).not.toBeInTheDocument();
    expect(panel.queryByText('Assignment past')).not.toBeInTheDocument();
    expect(panel.queryByText('Assignment future')).not.toBeInTheDocument();
  });

  it('keeps returned work actionable with its revision deadline instead of hiding every saved submission', async () => {
    const revision = {
      ...assignmentRow('revision', 'current-course', 'RETURNED_FOR_REVISION'),
      assignment: { ...assignmentRow('revision', 'current-course').assignment, due_date: '2025-01-01T00:00:00.000Z' },
      submission: {
        submission_id: 'revision-submission',
        status: 'RETURNED_FOR_REVISION',
        submitted_at: '2026-10-10T10:00:00.000Z',
        revision_due_at: '2099-11-25T12:00:00.000Z',
        marks_awarded: null,
        faculty_remarks: 'Revise the introduction',
      },
      can_resubmit: true,
    };
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/assignments/my'
        ? [revision, { ...assignmentRow('submitted', 'current-course', 'SUBMITTED'), submission: { submission_id: 'saved' } }, assignmentRow('graded', 'current-course', 'GRADED')]
        : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByText('Assignment revision')).toBeInTheDocument();
    const panel = dashboardPanel('Pending Assignments');
    expect(panel.getByRole('link', { name: 'Re-upload' })).toHaveAttribute('href', '/student/courses/current-course');
    expect(panel.getByText(/25 Nov/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Assignments: 1' })).toHaveTextContent('No overdue work');
    expect(panel.queryByText('Assignment submitted')).not.toBeInTheDocument();
    expect(panel.queryByText('Assignment graded')).not.toBeInTheDocument();
  });

  it('does not replace an empty current semester with past, future, or demo activity', async () => {
    mocks.demoMode = true;
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/courses/my-enrollments'
        ? { ...enrollmentData(), enrollments: enrollmentData().enrollments.filter((row) => row.semester !== 2) }
        : path === '/api/academics/assignments/my'
          ? [assignmentRow('past', 'old-course'), assignmentRow('future', 'future-course')]
          : path.endsWith('/timetable/today')
            ? [timetableRow('past', 'old-course'), timetableRow('future', 'future-course')]
            : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Pending Assignments: 0' })).toBeInTheDocument();
    expect(dashboardPanel("Today's Schedule").getByText('No classes today')).toBeInTheDocument();
    expect(dashboardPanel('Pending Assignments').getByText('Nothing in this filter')).toBeInTheDocument();
    expect(dashboardPanel('Upcoming Exams').getByText('No upcoming exams')).toBeInTheDocument();
    expect(dashboardPanel('Current Semester Courses').getByText('No current-semester courses')).toBeInTheDocument();
    expect(dashboardPanel('Current Semester Courses').queryByText('Past semester subject')).not.toBeInTheDocument();
    expect(screen.queryByText(/Assignment (past|future)|Class (past|future)/)).not.toBeInTheDocument();
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/student/exam-desk');
  });

  it('shows current-semester GPA while keeping degree credits and historical outstanding fees as overall totals', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith('/finance')
        ? { total_outstanding: 46500, pending_demands: [{ semester: 1, payable_amount: 30000, status: 'OVERDUE' }, { semester: 2, payable_amount: 16500, status: 'PENDING' }], gates: { finance_clear: false } }
        : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    const gpa = await screen.findByRole('link', { name: 'Current semester GPA: 8.50' });
    expect(gpa).toHaveTextContent('Semester 2');
    expect(gpa).not.toHaveTextContent(/overall|all semesters/i);
    expect(screen.getByRole('link', { name: 'Degree Progress: 60/160' })).toHaveTextContent(/overall|all semesters/i);
    expect(screen.getByRole('link', { name: 'Fee Status: ₹46,500' })).toHaveTextContent(/all semesters|overall/i);
    expect(dashboardPanel('Degree Progress').getByText(/overall|all semesters/i)).toBeInTheDocument();
  });

  it('matches the current-semester GPA in Results instead of showing cumulative CGPA, an older semester, or a semester average', async () => {
    const publishedHistory = {
      cgpa: 7.33,
      total_credits_earned: 6,
      total_credits_attempted: 6,
      total_grade_points: 44,
      total_semesters: 4,
      current_semester: 3,
      semesters: [
        semesterGrade(1, 8),
        { ...semesterGrade(2, 6), credits: 2, credits_earned: 2, credits_attempted: 2, courses: [{ ...semesterGrade(2, 6).courses[0], credits: 2 }] },
      ],
      component_marks_by_semester: [],
      exam_reports: [],
      grade_cards: [],
      backlogs: { uncleared: [], cleared: [] },
    };
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith('/metrics')
        ? { ...response(path), cgpa: publishedHistory.cgpa, credits_completed: publishedHistory.total_credits_earned }
        : path === '/api/academics/marks/history' ? publishedHistory : response(path),
    ));
    const dashboard = render(<StudentEnterpriseDashboard />);
    const gpa = await screen.findByRole('link', { name: 'Current semester GPA: 6.00' });
    expect(gpa).toHaveTextContent('Semester 2');
    for (const value of ['7.33', '7.00', '8.00']) {
      expect(screen.queryByRole('link', { name: `Current semester GPA: ${value}` })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Overall CGPA', { exact: true })).not.toBeInTheDocument();
    dashboard.unmount();
    render(<StudentMarksWorkspace />);
    const semesterButton = await screen.findByRole('button', { name: 'Semester 2' });
    fireEvent.click(semesterButton);
    const semesterGpa = await screen.findByText('Semester GPA (SGPA)', { exact: true });
    expect(within(semesterGpa.parentElement!).getByText('6.00', { exact: true })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Semester academic summary' });
    expect(within(summary).getByText('6.00', { exact: true })).toBeInTheDocument();
    expect(within(summary).queryByText('7.33', { exact: true })).not.toBeInTheDocument();
  });

  it('does not turn an ungraded current semester into zero, cumulative CGPA, an older score, or a demo score', async () => {
    mocks.demoMode = true;
    const ungraded = semesterGrade(2, null);
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/marks/history'
        ? marksHistory([semesterGrade(1, 9), { ...ungraded, sgpa: 0 }]) : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    await screen.findByRole('link', { name: 'Attendance: 92%' });
    const gpa = screen.getByRole('link', { name: 'Current semester GPA: —' });
    expect(gpa).toHaveTextContent('Semester 2');
    expect(gpa).toHaveTextContent('Awaiting grades');
    for (const value of ['0.00', '8.50', '8.75', '9.00']) {
      expect(screen.queryByRole('link', { name: `Current semester GPA: ${value}` })).not.toBeInTheDocument();
    }
  });

  it('retains a real failed-course zero GPA for the current semester', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/marks/history' ? marksHistory([semesterGrade(1, 9), semesterGrade(2, 0)]) : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Current semester GPA: 0.00' })).toHaveTextContent('Semester 2');
    expect(screen.queryByText(/Awaiting grades/)).not.toBeInTheDocument();
  });

  it('awaits current-semester grades rather than falling back to the latest published semester', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/courses/my-enrollments' ? enrollmentData(5)
        : path === '/api/academics/marks/history' ? marksHistory([semesterGrade(1, 9), semesterGrade(4, 7)])
          : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    await screen.findByRole('link', { name: 'Attendance: 92%' });
    const gpa = screen.getByRole('link', { name: 'Current semester GPA: —' });
    expect(gpa).toHaveTextContent('Semester 5');
    expect(gpa).toHaveTextContent('Awaiting grades');
    expect(screen.queryByRole('link', { name: 'Current semester GPA: 7.00' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Current semester GPA: 8.50' })).not.toBeInTheDocument();
  });

  it('prefers the validated profile semester over a conflicting course fallback and matches the Results default', async () => {
    const history = marksHistory([semesterGrade(1, 9), semesterGrade(2, 6.5)]);
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/student/profile' ? { name: 'Student A', semester: 2 }
        : path === '/api/academics/courses/my-enrollments' ? enrollmentData(1)
          : path === '/api/academics/marks/history' ? { ...history, current_semester: 1 }
            : response(path),
    ));
    const dashboard = render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Current semester GPA: 6.50' })).toHaveTextContent('Semester 2');
    expect(screen.queryByRole('link', { name: 'Current semester GPA: 9.00' })).not.toBeInTheDocument();
    dashboard.unmount();
    render(<StudentMarksWorkspace />);
    const summary = await screen.findByRole('region', { name: 'Semester academic summary' });
    await waitFor(() => expect(within(summary).getByText('Semester 2 GPA (SGPA)')).toBeInTheDocument());
    expect(within(summary).getByText('6.50', { exact: true })).toBeInTheDocument();
  });

  it('keeps profile-scoped GPA available when enrollment metadata fails', async () => {
    mocks.api.get.mockImplementation((path: string) => path === '/api/academics/courses/my-enrollments'
      ? Promise.reject(new Error('enrollment metadata unavailable'))
      : Promise.resolve(path === '/api/student/profile' ? { name: 'Student A', semester: 2 } : response(path)));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('link', { name: 'Current semester GPA: 8.50' })).toHaveTextContent('Semester 2');
    expect(screen.getByRole('alert')).toHaveTextContent('Semester courses');
    expect(screen.getByRole('link', { name: 'Pending Assignments: —' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fee Status: Clear' })).toBeInTheDocument();
  });

  it('handles no grade history as awaiting grades without a false zero or API error', async () => {
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/marks/history' ? marksHistory([]) : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Current semester GPA: —' })).toHaveTextContent('Awaiting grades'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Degree Progress: 60/160' })).toBeInTheDocument();
  });

  it('isolates grade-history failures from attendance, degree credits and fees, and recovers through retry', async () => {
    mocks.demoMode = true;
    mocks.api.get.mockImplementation((path: string) => path === '/api/academics/marks/history'
      ? Promise.reject(new Error('private grade database detail')) : Promise.resolve(response(path)));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('GPA');
    expect(screen.getByRole('link', { name: 'Current semester GPA: —' })).toHaveTextContent('GPA unavailable');
    expect(screen.getByRole('link', { name: 'Degree Progress: 60/160' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attendance: 92%' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fee Status: Clear' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Current semester GPA: 8.50' })).not.toBeInTheDocument();
    expect(screen.queryByText(/private grade database/)).not.toBeInTheDocument();
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(response(path)));
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByRole('link', { name: 'Current semester GPA: 8.50' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the semester-scoped exam schedule only after resolving the current semester and does not expose venue or seat details', async () => {
    let resolveEnrollments!: (value: ReturnType<typeof enrollmentData>) => void;
    const enrollments = new Promise<ReturnType<typeof enrollmentData>>((resolve) => { resolveEnrollments = resolve; });
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/academics/courses/my-enrollments') return enrollments;
      if (path === '/api/academics/exams/schedule?semester=2') return Promise.resolve([
        { exam_schedule_id: 'current-exam', subject_id: 42, exam_type: 'MID_TERM', exam_date: '2099-10-21', start_time: '09:00', end_time: '11:00', venue: 'PRIVATE ROOM 510', seat_no: 'PRIVATE SEAT 42' },
      ]);
      return Promise.resolve(response(path));
    });
    render(<StudentEnterpriseDashboard />);
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/academics/exams/schedule?semester=2');
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/student/exam-desk');
    resolveEnrollments(enrollmentData());
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith('/api/academics/exams/schedule?semester=2'));
    const panel = dashboardPanel('Upcoming Exams');
    expect(await panel.findByText(/mid.term/i)).toBeInTheDocument();
    expect(panel.getByText(/Semester 2/)).toBeInTheDocument();
    expect(panel.queryByText(/PRIVATE ROOM|PRIVATE SEAT|Hall TBA/)).not.toBeInTheDocument();
  });

  it('does not show unscoped academic activity when current enrollment lookup fails and recovers on retry', async () => {
    mocks.demoMode = true;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/academics/courses/my-enrollments') return Promise.reject(new Error('private enrollment database detail'));
      if (path === '/api/academics/assignments/my') return Promise.resolve([assignmentRow('current', 'current-course')]);
      if (path.endsWith('/timetable/today')) return Promise.resolve([timetableRow('current', 'current-course')]);
      return Promise.resolve(response(path));
    });
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/semester|enrollment/i);
    expect(screen.getByRole('link', { name: 'Pending Assignments: —' })).toBeInTheDocument();
    expect(dashboardPanel('Current Semester Courses').getByText('Semester courses could not be loaded')).toBeInTheDocument();
    expect(dashboardPanel('Pending Assignments').getByText('Semester courses could not be loaded')).toBeInTheDocument();
    expect(dashboardPanel("Today's Schedule").getAllByText('Semester courses could not be loaded').length).toBeGreaterThan(0);
    expect(dashboardPanel('Upcoming Exams').getByText('Semester courses could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('Assignment current')).not.toBeInTheDocument();
    expect(screen.queryByText('Class current')).not.toBeInTheDocument();
    expect(screen.queryByText(/private enrollment database/)).not.toBeInTheDocument();
    expect(screen.queryByText('No classes today')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Current semester GPA: —' })).toHaveTextContent('GPA unavailable');
    expect(screen.getByRole('link', { name: 'Fee Status: Clear' })).toBeInTheDocument();
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/academics/exams/schedule?semester=2');

    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/assignments/my' ? [assignmentRow('current', 'current-course')] : response(path),
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByText('Assignment current')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Assignments: 1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([0, -1, 1.5, Number.NaN])('does not manufacture Semester 1 when current-semester metadata is invalid (%s)', async (invalidSemester) => {
    mocks.demoMode = true;
    mocks.api.get.mockImplementation((path: string) => Promise.resolve(
      path === '/api/academics/courses/my-enrollments'
        ? { ...enrollmentData(), current_semester: invalidSemester }
        : path === '/api/academics/assignments/my'
          ? [assignmentRow('current', 'current-course')]
          : response(path),
    ));
    render(<StudentEnterpriseDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Semester courses');
    expect(dashboardPanel('Current Semester Courses').getByText('Semester courses could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Assignments: —' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Current semester GPA: —' })).toHaveTextContent('GPA unavailable');
    expect(screen.queryByText('Assignment current')).not.toBeInTheDocument();
    expect(mocks.api.get.mock.calls.some(([path]) => String(path).startsWith('/api/academics/exams/schedule'))).toBe(false);
  });
});

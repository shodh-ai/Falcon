import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentAttendancePage from '@/app/(portals)/student/attendance/page';

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  return { get, api: { get }, demoMode: vi.fn(() => false) };
});

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => mocks.demoMode() }));

function subject(semester: number, code = `TEST-${semester}01`) {
  return {
    course_code: code,
    course_name: `Test course ${code}`,
    semester,
    attendance_percent: '80',
    status: 'ENROLLED',
    present_count: 8,
    absent_count: 2,
    total_classes: 10,
  };
}

function attendanceData() {
  return {
    overall_percent: 43.75,
    current_semester: 2,
    subject_wise: [
      { ...subject(1), attendance_percent: '20', present_count: 2, absent_count: 8 },
      { ...subject(2), attendance_percent: '50', present_count: 1, absent_count: 1, total_classes: 2 },
      { ...subject(2, 'TEST-202'), attendance_percent: '100', present_count: 4, absent_count: 0, total_classes: 4 },
    ],
    progression: [
      { semester: 1, status: 'COMPLETED', courses_count: 1 },
      { semester: 2, status: 'IN_PROGRESS', courses_count: 2 },
      { semester: 3, status: 'UPCOMING', courses_count: 0 },
    ],
  };
}

function expectSemesterCourses(semester: number, codes: string[], excludedCodes: string[]) {
  const table = screen.getByRole('table', { name: `Semester ${semester} course attendance` });
  const cards = screen.getByRole('list', { name: `Semester ${semester} attendance cards` });
  expect(within(table).getAllByRole('row')).toHaveLength(codes.length + 1);
  expect(within(cards).getAllByRole('listitem')).toHaveLength(codes.length);
  for (const code of codes) {
    expect(within(table).getByText(code)).toBeInTheDocument();
    expect(within(cards).getByText(code)).toBeInTheDocument();
  }
  for (const code of excludedCodes) {
    expect(within(table).queryByText(code)).not.toBeInTheDocument();
    expect(within(cards).queryByText(code)).not.toBeInTheDocument();
  }
}

describe('Student attendance page', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.api = { get: mocks.get };
    mocks.demoMode.mockReturnValue(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('removes the calculation help card while keeping API attendance and progression visible', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 80,
      current_semester: 3,
      subject_wise: [{
        course_code: 'TEST-301', course_name: 'Attendance Test Course', semester: 3,
        attendance_percent: '80', status: 'REGULAR', present_count: 8, absent_count: 2, total_classes: 10,
      }],
      progression: [{ semester: 3, status: 'IN_PROGRESS', courses_count: 1 }],
    });

    render(<StudentAttendancePage />);

    expect(await screen.findByText('Semester 3 attendance')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByText('How attendance is calculated')).not.toBeInTheDocument();
    expect(screen.queryByText(/A simple view of the numbers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Example: 8 attended/)).not.toBeInTheDocument();
    const courseRow = within(screen.getByRole('table')).getByText('TEST-301').closest('tr')!;
    expect(within(courseRow).getByText('Attendance Test Course')).toBeInTheDocument();
    expect(within(courseRow).getByText('8')).toBeInTheDocument();
    expect(within(courseRow).getByText('2')).toBeInTheDocument();
    expect(within(courseRow).getByText('10')).toBeInTheDocument();
    expect(within(courseRow).getByText('80.0%')).toBeInTheDocument();
    const progression = screen.getByRole('list', { name: 'Semester progression' });
    expect(within(progression).getByText('Semester 3')).toBeInTheDocument();
    expect(within(progression).getByText('Current semester').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(within(progression).getByText('1 course registered')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/api/student/attendance');
  });

  it('keeps the existing empty attendance state without the removed help card', async () => {
    mocks.get.mockResolvedValue({ overall_percent: 0, subject_wise: [], progression: [] });
    render(<StudentAttendancePage />);
    expect(await screen.findByText('No subject records')).toBeInTheDocument();
    expect(screen.getByText('No progression data')).toBeInTheDocument();
    expect(screen.queryByText('How attendance is calculated')).not.toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.queryByText(/Below 75% minimum/)).not.toBeInTheDocument();
  });

  it('defaults to the API current semester and filters both desktop and mobile records', async () => {
    mocks.get.mockResolvedValue(attendanceData());
    render(<StudentAttendancePage />);

    const tabs = await screen.findByRole('tablist', { name: 'Attendance semesters' });
    expect(within(tabs).getByRole('tab', { name: 'Semester 2' })).toHaveAttribute('aria-selected', 'true');
    expectSemesterCourses(2, ['TEST-201', 'TEST-202'], ['TEST-101']);
    expect(screen.getByText('83.33%')).toBeInTheDocument();
    expect(screen.getByText('Semester 2 attendance')).toBeInTheDocument();
    expect(screen.getByText('5 of 6 classes attended · Meeting minimum requirement')).toBeInTheDocument();
    expect(screen.queryByText(/Across all semesters/)).not.toBeInTheDocument();
    expect(screen.queryByText('43.75%')).not.toBeInTheDocument();
  });

  it('updates the summary from the selected semester counts when switching tabs without refetching', async () => {
    mocks.get.mockResolvedValue(attendanceData());
    render(<StudentAttendancePage />);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Semester 1' }), { button: 0 });
    expect(screen.getByRole('tab', { name: 'Semester 1' })).toHaveAttribute('aria-selected', 'true');
    expectSemesterCourses(1, ['TEST-101'], ['TEST-201', 'TEST-202']);
    expect(screen.queryByRole('table', { name: 'Semester 2 course attendance' })).not.toBeInTheDocument();
    expect(screen.getByText('Semester 1 attendance')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('2 of 10 classes attended · Below 75% minimum — review subject-wise')).toBeInTheDocument();
    expect(screen.queryByText('83.33%')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    const currentProgression = within(screen.getByRole('list', { name: 'Semester progression' })).getByText('Current semester').closest('li')!;
    expect(currentProgression).toHaveTextContent('Semester 2');
    expect(currentProgression).toHaveAttribute('aria-current', 'step');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Semester 2' }), { button: 0 });
    expectSemesterCourses(2, ['TEST-201', 'TEST-202'], ['TEST-101']);
    expect(screen.getByText('83.33%')).toBeInTheDocument();
    expect(screen.queryByText('20%')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('weights marked class counts instead of averaging subject percentages or including other semesters', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 88,
      current_semester: 3,
      subject_wise: [
        { ...subject(3), attendance_percent: '100', present_count: 1, absent_count: 0, total_classes: 1 },
        { ...subject(3, 'TEST-302'), attendance_percent: '11.11', present_count: 1, absent_count: 8, total_classes: 9 },
        { ...subject(3, 'TEST-303'), attendance_percent: '100', present_count: 0, absent_count: 0, total_classes: 0 },
        { ...subject(1), attendance_percent: '100', present_count: 50, absent_count: 0, total_classes: 50 },
      ],
      progression: [],
    });
    render(<StudentAttendancePage />);

    expect(await screen.findByText('Semester 3 attendance')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('2 of 10 classes attended · Below 75% minimum — review subject-wise')).toBeInTheDocument();
    expect(screen.queryByText('88%')).not.toBeInTheDocument();
    expect(screen.queryByText('55.56%')).not.toBeInTheDocument();
  });

  it.each(['0', '100'])('does not invent a semester percentage when no classes are marked, even with a stored subject percentage of %s', async (storedPercent) => {
    mocks.get.mockResolvedValue({
      overall_percent: 83.33,
      current_semester: 2,
      subject_wise: [
        { ...subject(1), attendance_percent: storedPercent, present_count: 0, absent_count: 0, total_classes: 0 },
        subject(2),
      ],
      progression: [],
    });
    render(<StudentAttendancePage />);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Semester 1' }), { button: 0 });
    expect(screen.getAllByText('Not recorded')).toHaveLength(3); // Summary, desktop row and mobile card.
    expect(screen.getByText('No classes have been marked for Semester 1 yet.')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('83.33%')).not.toBeInTheDocument();
    expect(screen.queryByText(/Below 75% minimum|Meeting minimum requirement/)).not.toBeInTheDocument();
  });

  it('shows a real zero percent when classes are marked but none were attended', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 83.33,
      current_semester: 1,
      subject_wise: [{ ...subject(1), attendance_percent: '0', present_count: 0, absent_count: 5, total_classes: 5 }],
      progression: [],
    });
    render(<StudentAttendancePage />);

    expect(await screen.findByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 of 5 classes attended · Below 75% minimum — review subject-wise')).toBeInTheDocument();
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument();
    expect(screen.getAllByText('0.0%')).toHaveLength(2);
  });

  it('derives desktop and mobile subject badges from marked counts rather than a stale stored percentage', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 100, current_semester: 2,
      subject_wise: [{ ...subject(2), attendance_percent: '100', present_count: 2, absent_count: 1, total_classes: 3 }],
      progression: [],
    });
    render(<StudentAttendancePage />);
    const table = await screen.findByRole('table', { name: 'Semester 2 course attendance' });
    const cards = screen.getByRole('list', { name: 'Semester 2 attendance cards' });
    for (const view of [table, cards]) {
      expect(within(view).getByText('66.7%')).toBeInTheDocument();
      expect(within(view).queryByText('100.0%')).not.toBeInTheDocument();
    }
  });

  it('derives sorted unique semester tabs from real subjects rather than fixed semesters or future progression', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 80,
      current_semester: 5,
      subject_wise: [subject(5), subject(3), subject(3, 'TEST-302')],
      progression: [{ semester: 8, status: 'UPCOMING', courses_count: 0 }],
    });
    render(<StudentAttendancePage />);

    const tabs = await screen.findByRole('tablist', { name: 'Attendance semesters' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Semester 3', 'Semester 5']);
    expect(screen.queryByRole('tab', { name: 'Semester 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Semester 8' })).not.toBeInTheDocument();
    expectSemesterCourses(5, ['TEST-501'], ['TEST-301', 'TEST-302']);

    fireEvent.mouseDown(within(tabs).getByRole('tab', { name: 'Semester 3' }), { button: 0 });
    expectSemesterCourses(3, ['TEST-301', 'TEST-302'], ['TEST-501']);
  });

  it('ignores invalid semester numbers when building the semester selector', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 80,
      current_semester: 3,
      subject_wise: [subject(3), subject(0), subject(-1), subject(1.5)],
      progression: [],
    });
    render(<StudentAttendancePage />);

    const tabs = await screen.findByRole('tablist', { name: 'Attendance semesters' });
    expect(within(tabs).getAllByRole('tab')).toHaveLength(1);
    expect(within(tabs).getByRole('tab', { name: 'Semester 3' })).toHaveAttribute('aria-selected', 'true');
    expectSemesterCourses(3, ['TEST-301'], ['TEST-001', 'TEST--101', 'TEST-1.501']);
  });

  it('defaults to the latest recorded semester when current semester is unavailable', async () => {
    mocks.get.mockResolvedValue({
      overall_percent: 80,
      subject_wise: [subject(5), subject(3)],
      progression: [],
    });
    render(<StudentAttendancePage />);

    expect(await screen.findByRole('tab', { name: 'Semester 5' })).toHaveAttribute('aria-selected', 'true');
    expectSemesterCourses(5, ['TEST-501'], ['TEST-301']);
  });

  it('shows a semester-specific empty state when the current semester has no enrolled subjects', async () => {
    mocks.get.mockResolvedValue({
      ...attendanceData(),
      current_semester: 3,
    });
    render(<StudentAttendancePage />);

    expect(await screen.findByRole('tab', { name: 'Semester 3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No subject records')).toBeInTheDocument();
    expect(screen.getByText('Subjects for Semester 3 will appear once you are registered.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('No classes have been marked for Semester 3 yet.')).toBeInTheDocument();
    expect(screen.queryByText('83.33%')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Semester 1' }), { button: 0 });
    expectSemesterCourses(1, ['TEST-101'], ['TEST-201', 'TEST-202']);
  });

  it('supports keyboard navigation between semester tabs', async () => {
    mocks.get.mockResolvedValue(attendanceData());
    render(<StudentAttendancePage />);

    const current = await screen.findByRole('tab', { name: 'Semester 2' });
    act(() => current.focus());
    fireEvent.keyDown(current, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Semester 1' })).toHaveAttribute('aria-selected', 'true'));
    expectSemesterCourses(1, ['TEST-101'], ['TEST-201', 'TEST-202']);
  });

  it('shows a safe error without demo data or raw server messages after an API failure', async () => {
    mocks.demoMode.mockReturnValue(true);
    mocks.get.mockRejectedValue(new Error('Sensitive database host internal.test.invalid failed'));
    render(<StudentAttendancePage />);

    expect(await screen.findByText('Attendance unavailable')).toBeInTheDocument();
    expect(screen.getByText('Attendance could not be loaded. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText(/Below 75% minimum/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sensitive database/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/SMK-PORTAL|CSE101/)).not.toBeInTheDocument();
  });

  it('stops loading when the attendance API never resolves', async () => {
    vi.useFakeTimers();
    mocks.get.mockImplementation(() => new Promise(() => {}));
    render(<StudentAttendancePage />);
    expect(screen.getByText('Loading attendance…')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
    });

    expect(screen.getByText('Attendance unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Loading attendance…')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('hides the previous account immediately and resets semester selection for a new authenticated API', async () => {
    mocks.get.mockResolvedValue(attendanceData());
    const { rerender } = render(<StudentAttendancePage />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Semester 1' }), { button: 0 });
    expectSemesterCourses(1, ['TEST-101'], ['TEST-201', 'TEST-202']);

    let resolveNewAccount!: (value: ReturnType<typeof attendanceData>) => void;
    const nextGet = vi.fn(() => new Promise<ReturnType<typeof attendanceData>>((resolve) => { resolveNewAccount = resolve; }));
    mocks.api = { get: nextGet };
    rerender(<StudentAttendancePage />);
    expect(screen.getByText('Loading attendance…')).toBeInTheDocument();
    expect(screen.queryByText('TEST-101')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    await act(async () => {
      resolveNewAccount({
        overall_percent: 80,
        current_semester: 3,
        subject_wise: [subject(3, 'NEW-301'), subject(5, 'NEW-501')],
        progression: [],
      });
    });

    expect(screen.getByRole('tab', { name: 'Semester 3' })).toHaveAttribute('aria-selected', 'true');
    expectSemesterCourses(3, ['NEW-301'], ['NEW-501', 'TEST-101']);
    expect(nextGet).toHaveBeenCalledWith('/api/student/attendance');
  });

  it('ignores a late attendance response from a previous authenticated API', async () => {
    let resolveOldAccount!: (value: ReturnType<typeof attendanceData>) => void;
    mocks.get.mockImplementation(() => new Promise<ReturnType<typeof attendanceData>>((resolve) => { resolveOldAccount = resolve; }));
    const { rerender } = render(<StudentAttendancePage />);

    const nextGet = vi.fn().mockResolvedValue({
      overall_percent: 80,
      current_semester: 3,
      subject_wise: [subject(3, 'NEW-301')],
      progression: [],
    });
    mocks.api = { get: nextGet };
    rerender(<StudentAttendancePage />);
    expect(await screen.findByRole('tab', { name: 'Semester 3' })).toHaveAttribute('aria-selected', 'true');

    await act(async () => { resolveOldAccount(attendanceData()); });
    expectSemesterCourses(3, ['NEW-301'], ['TEST-101', 'TEST-201']);
    expect(screen.queryByRole('tab', { name: 'Semester 2' })).not.toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamDayPage from '@/app/(portals)/exam-cell/exam-day/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
// Attendance page behavior is exercised here; the operations panel has its own
// real component/API interaction coverage in ExamDayOperationsPanel.test.tsx.
vi.mock('@/components/exam-cell/ExamDayOperationsPanel', () => ({ ExamDayOperationsPanel: () => null }));

const prefix = '/api/exam-cell/exam-day';
const exam = {
  exam_schedule_id: 'schedule-a', exam_type: 'END_TERM', exam_date: '2026-10-21',
  start_time: '09:00:00', venue: 'Hall A', subject_name: 'Test subject', marked_count: 0,
};
const student = {
  student_user_id: 'student-a', student_name: 'Test Student', enrollment_number: 'TEST-001',
  room: 'A', seat_number: '1', attendance_status: null, attendance_id: null,
};
const attendance = {
  attendance_id: 'attendance-a', student_name: 'Test Student', enrollment_number: 'TEST-001',
  status: 'PRESENT', marked_at: '2026-10-21T04:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.primaryRole = 'ExamCell';
  mocks.api.get.mockImplementation(async (path: string) => {
    if (path === `${prefix}/today`) return [exam];
    if (path.startsWith(`${prefix}/roster?`)) return [student];
    if (path.startsWith(`${prefix}/attendance?`)) return [];
    throw new Error(`Unexpected test path ${path}`);
  });
  mocks.api.post.mockResolvedValue(attendance);
});

describe('Exam Day real request and state flow', () => {
  it('records the selected roster student and reloads the actual attendance response', async () => {
    mocks.api.post.mockImplementation(async () => {
      mocks.api.get.mockImplementation(async (path: string) => {
        if (path === `${prefix}/today`) return [{ ...exam, marked_count: 1 }];
        if (path.startsWith(`${prefix}/roster?`)) return [{ ...student, attendance_status: 'PRESENT' }];
        return [attendance];
      });
      return attendance;
    });
    render(<ExamDayPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'PRESENT', exact: true }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${prefix}/attendance`, {
      exam_schedule_id: 'schedule-a', student_user_id: 'student-a', status: 'PRESENT',
    }));
    expect(await screen.findByText('1 marked')).toBeVisible();
    expect(screen.getAllByText('Test Student')).toHaveLength(2);
    expect(mocks.success).toHaveBeenCalledWith('Marked present');
  });

  it('does not offer marking controls to an ExamOperator with an extra assigned role', async () => {
    mocks.user.primaryRole = 'ExamOperator';
    render(<ExamDayPage />);
    await screen.findByText('Test Student');
    expect(screen.queryByRole('button', { name: 'PRESENT', exact: true })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows exam API failure rather than claiming no examinations exist', async () => {
    mocks.api.get.mockRejectedValue(new Error('Service unavailable'));
    render(<ExamDayPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.queryByText('No exams scheduled for today.')).not.toBeInTheDocument();
    expect(screen.queryByText('Attendance register')).not.toBeInTheDocument();
  });

  it('shows a genuine empty exam list', async () => {
    mocks.api.get.mockResolvedValue([]);
    render(<ExamDayPage />);
    expect(await screen.findByText('No exams scheduled for today.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fails closed when a roster/attendance read fails and allows an explicit retry', async () => {
    let failed = true;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === `${prefix}/today`) return [exam];
      if (path.startsWith(`${prefix}/roster?`)) {
        if (failed) throw new Error('Roster unavailable');
        return [student];
      }
      return [];
    });
    render(<ExamDayPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Roster unavailable');
    expect(screen.queryByText('No attendance marked yet for this session.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PRESENT', exact: true })).not.toBeInTheDocument();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading roster' }));
    expect(await screen.findByRole('button', { name: 'PRESENT', exact: true })).toBeEnabled();
  });

  it('does not treat an identity match outside the selected roster as entry clearance', async () => {
    mocks.api.post.mockResolvedValue({
      student: { user_id: 'student-outside', name: 'Other Student', enrollment_number: 'OTHER-001' },
      seating: [], verified: true,
    });
    render(<ExamDayPage />);
    await screen.findByText('Test Student');
    fireEvent.change(screen.getByPlaceholderText('Scan hall ticket QR or enter enrollment number'), { target: { value: 'OTHER-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Other Student')).toBeVisible();
    expect(screen.getByText(/Not on the selected examination seating roster/)).toBeVisible();
    expect(screen.queryByText('Verified for entry')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark PRESENT' })).not.toBeInTheDocument();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate marks and switching schedules while a write is pending', async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.post.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ExamDayPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'PRESENT', exact: true }));
    expect(screen.getByRole('button', { name: 'ABSENT', exact: true })).toBeDisabled();
    expect(screen.getByLabelText('Examination seating roster')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'PRESENT', exact: true }));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(attendance); });
  });

  it('does not claim success when the attendance write fails', async () => {
    mocks.api.post.mockRejectedValue(new Error('Attendance could not be saved'));
    render(<ExamDayPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'PRESENT', exact: true }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Attendance could not be saved'));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText('Not marked')).toBeVisible();
  });

  it('discards a late roster response for the previously selected examination', async () => {
    let resolveOld!: (value: unknown) => void;
    const oldRoster = new Promise((done) => { resolveOld = done; });
    const nextExam = { ...exam, exam_schedule_id: 'schedule-b', subject_name: 'Second subject' };
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === `${prefix}/today`) return [exam, nextExam];
      if (path === `${prefix}/roster?exam_schedule_id=schedule-a`) return oldRoster;
      if (path === `${prefix}/roster?exam_schedule_id=schedule-b`) return [{ ...student, student_name: 'Second Student', student_user_id: 'student-b' }];
      return [];
    });
    render(<ExamDayPage />);
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith(`${prefix}/roster?exam_schedule_id=schedule-a`));
    fireEvent.click(screen.getByRole('button', { name: /Second subject/ }));
    expect(await screen.findByText('Second Student')).toBeVisible();
    await act(async () => { resolveOld([student]); });
    expect(screen.queryByText('Test Student')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PRESENT', exact: true }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(`${prefix}/attendance`, {
      exam_schedule_id: 'schedule-b', student_user_id: 'student-b', status: 'PRESENT',
    }));
  });

  it('does not display an old exam list after the authenticated API context changes', async () => {
    const previousApi = mocks.api;
    let resolvePrevious!: (value: unknown) => void;
    previousApi.get.mockReturnValue(new Promise((done) => { resolvePrevious = done; }));
    const view = render(<ExamDayPage />);
    try {
      mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
      view.rerender(<ExamDayPage />);
      expect(await screen.findByText('No exams scheduled for today.')).toBeVisible();
      await act(async () => { resolvePrevious([exam]); });
      expect(screen.queryByRole('button', { name: /Test subject/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Attendance register')).not.toBeInTheDocument();
    } finally {
      mocks.api = previousApi;
    }
  });

  it('retrieves the selected date so past missing-script cases remain reachable', async () => {
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === `${prefix}/today?date=2026-10-20`) return [{ ...exam, exam_date: '2026-10-20' }];
      return [];
    });
    render(<ExamDayPage />);
    await screen.findByText('No exams scheduled for today.');
    fireEvent.change(screen.getByLabelText('Examination date'), { target: { value: '2026-10-20' } });
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith(`${prefix}/today?date=2026-10-20`));
    expect(await screen.findByRole('button', { name: /Test subject/ })).toBeVisible();
  });
});

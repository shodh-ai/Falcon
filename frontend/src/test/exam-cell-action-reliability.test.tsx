import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeadlinesPage from '@/app/(portals)/exam-cell/deadlines/page';
import CalendarPage from '@/app/(portals)/exam-cell/calendar/page';
import AnswerSheetsPage from '@/app/(portals)/exam-cell/answer-sheets/page';
import ExamDayPage from '@/app/(portals)/exam-cell/exam-day/page';

const { api, toast, role } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
  role: { value: 'examcell', user: null as { role: string; roles: string[]; primaryRole: string } | null },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: role.user ?? { roles: [role.value] } }) }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/exam-cell/ExamDayOperationsPanel', () => ({ ExamDayOperationsPanel: () => null }));
vi.mock('@/components/exam-cell/ExamCalendar', () => ({ ExamCalendar: () => <div>Calendar events</div> }));

beforeEach(() => {
  api.get.mockReset().mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/schedules') return [{ exam_schedule_id: 'synthetic-exam', subject_name: 'Synthetic subject', exam_date: '2026-11-01' }];
    if (path.includes('/roster?')) return [{ student_user_id: 'synthetic-student', student_name: 'Synthetic Student' }];
    return [];
  });
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  role.value = 'examcell';
  role.user = null;
});

async function selectBookletContext() {
  await screen.findByRole('option', { name: 'Synthetic subject · 2026-11-01' });
  fireEvent.change(screen.getByLabelText('Booklet examination'), { target: { value: 'synthetic-exam' } });
  await screen.findByRole('option', { name: 'Synthetic Student' });
  fireEvent.change(screen.getByLabelText('Booklet student'), { target: { value: 'synthetic-student' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. AS-2026-001'), { target: { value: 'SYN-20261021' } });
}

describe('Examination action reliability', () => {
  it.each([
    ['deadlines', DeadlinesPage, 'Add deadline'],
    ['calendar', CalendarPage, 'Add event'],
    ['answer sheets', AnswerSheetsPage, 'Issue & generate QR'],
    ['exam-day identity', ExamDayPage, 'Verify'],
  ] as const)('mirrors backend primary-role permissions for %s and retains read-only restrictions', async (_label, Page, buttonName) => {
    role.user = { role: 'Faculty', roles: ['Faculty'], primaryRole: 'ExamCell' };
    const { rerender } = render(<Page />);
    const button = await screen.findByRole('button', { name: buttonName, exact: true });
    if (buttonName === 'Verify') fireEvent.change(screen.getByLabelText('Hall ticket QR or enrollment number'), { target: { value: 'SYNTHETIC-01' } });
    if (buttonName === 'Issue & generate QR') await selectBookletContext();
    expect(button).toBeEnabled();
    role.user = { role: 'Faculty', roles: [], primaryRole: 'Faculty' };
    rerender(<Page />);
    if (buttonName === 'Verify') expect(screen.getByRole('button', { name: buttonName, exact: true })).toBeDisabled();
    else expect(screen.queryByRole('button', { name: buttonName, exact: true })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('distinguishes deadline API failure from an empty list and supports retry', async () => {
    api.get.mockRejectedValueOnce(new Error('Deadline service unavailable'));
    render(<DeadlinesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Deadline service unavailable');
    expect(screen.queryByText('No active deadlines configured.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No active deadlines configured.')).toBeTruthy();
  });

  it('submits a deadline only once while its request is pending', async () => {
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { container } = render(<DeadlinesPage />);
    await screen.findByText('No active deadlines configured.');
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Synthetic deadline' } });
    fireEvent.change(container.querySelector('input[type="datetime-local"]')!, { target: { value: '2026-11-01T09:00' } });
    const button = screen.getByRole('button', { name: 'Add deadline' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { finish({}); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
  });

  it('shows a calendar load error instead of rendering an empty calendar', async () => {
    api.get.mockRejectedValueOnce(new Error('Calendar service unavailable'));
    render(<CalendarPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Calendar service unavailable');
    expect(screen.getByText('Calendar events')).not.toBeVisible();
  });

  it('submits a calendar milestone only once while pending', async () => {
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<CalendarPage />);
    await screen.findByText('Calendar events');
    fireEvent.change(screen.getByLabelText('Milestone title'), { target: { value: 'Synthetic milestone' } });
    fireEvent.change(screen.getByLabelText('Milestone date'), { target: { value: '2026-11-01' } });
    const button = screen.getByRole('button', { name: 'Add event' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { finish({}); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
  });

  it('does not describe an answer-sheet API failure as no tracked sheets', async () => {
    api.get.mockImplementation(async (path: string) => { if (path.includes('/answer-sheets')) throw new Error('Booklet service unavailable'); return []; });
    render(<AnswerSheetsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Booklet service unavailable');
    expect(screen.queryByText('No answer sheets tracked yet')).toBeNull();
  });

  it('guards repeated Enter submissions when issuing a booklet', async () => {
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AnswerSheetsPage />);
    await screen.findByText('No answer sheets tracked yet');
    await selectBookletContext();
    const field = screen.getByPlaceholderText('e.g. AS-2026-001');
    fireEvent.change(field, { target: { value: 'SYN-20261021' } });
    act(() => { fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.keyDown(field, { key: 'Enter' }); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { finish({ qr_payload: 'synthetic-qr' }); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
  });

  it('shows today-exam API failures instead of claiming no exams are scheduled', async () => {
    api.get.mockRejectedValueOnce(new Error('Exam-day service unavailable'));
    render(<ExamDayPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Exam-day service unavailable');
    expect(screen.queryByText('No exams scheduled for today.')).toBeNull();
  });

  it('does not trust an identity response that explicitly rejects entry', async () => {
    api.post.mockResolvedValue({ verified: false, student: { user_id: 'synthetic', name: 'Synthetic Student', enrollment_number: 'SYN001' }, seating: [] });
    render(<ExamDayPage />);
    await screen.findByText('No exams scheduled for today.');
    fireEvent.change(screen.getByLabelText('Hall ticket QR or enrollment number'), { target: { value: 'SYN001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify', exact: true }));
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText('Verified for entry')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows attendance failures with a retry instead of an empty register', async () => {
    api.get.mockImplementation((path: string) => path.endsWith('/today')
      ? Promise.resolve([{ exam_schedule_id: 'synthetic-exam', subject_name: 'Synthetic examination', start_time: '09:00', venue: 'Synthetic hall' }])
      : Promise.reject(new Error('Attendance unavailable')));
    render(<ExamDayPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Attendance unavailable');
    expect(screen.getByRole('button', { name: 'Retry attendance' })).toBeEnabled();
    expect(screen.queryByText('No attendance marked yet for this session.')).toBeNull();
  });

  it('keeps attendance marking unavailable to an operator lacking backend manage_sessions permission', async () => {
    role.value = 'examoperator';
    api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('/today')
      ? [{ exam_schedule_id: 'synthetic-exam', subject_name: 'Synthetic examination', start_time: '09:00', venue: 'Synthetic hall' }]
      : path.includes('/roster?') ? [{ student_user_id: 'synthetic-student', student_name: 'Synthetic Student', attendance_status: null }] : []));
    render(<ExamDayPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.queryByRole('button', { name: 'PRESENT', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ABSENT', exact: true })).toBeNull();
  });

  it('does not issue a new booklet while a lifecycle update is pending', async () => {
    api.get.mockImplementation(async (path: string) => path.includes('/answer-sheets') ? [{ sheet_id: 'synthetic-sheet', sheet_number: 'SYN-001', status: 'ISSUED', qr_payload: 'synthetic-qr', exam_schedule_id: 'synthetic-exam', student_user_id: 'synthetic-student' }] : []);
    let finish!: (value: object) => void;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AnswerSheetsPage />);
    const next = await screen.findByRole('button', { name: 'Next stage' });
    act(() => { fireEvent.click(next); fireEvent.click(next); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Issuing…' })).toBeDisabled();
    await act(async () => { finish({}); });
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
  });
});

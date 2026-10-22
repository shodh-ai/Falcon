import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import SeatingPage from '@/app/(portals)/exam-cell/seating/page';
import GradeCardsPage from '@/app/(portals)/exam-cell/grade-cards/page';

const { api, toast, auth } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
  auth: { user: { roles: ['ExamCell'] as string[], primaryRole: '', role: '' }, token: 'synthetic-token' },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/exam-cell/ExamCellPageHeader', () => ({
  ExamCellPageHeader: ({ actions }: { actions?: React.ReactNode }) => <header>{actions}</header>,
}));
// Request ordering and action ownership are isolated here; actual controls have browser coverage.
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));
vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const allocation = (branch = 'Own branch', room = 'Hall A') => ({
  student_name: 'Synthetic student', student_user_id: 'synthetic-student', branch_code: branch,
  room, seat_number: '01',
});
const card = (name: string, semester = 4) => ({
  grade_card_id: name, student_user_id: name, semester, cgpa: 9, status: 'DRAFT', published_at: null,
  payload: { sgpa: 9, cgpa: 9, result_stage: 'DRAFT' }, student_name: name,
  student_email: 'synthetic@example.invalid', enrollment_number: name,
});
function seatingData() {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/schedules') return [
      { exam_schedule_id: 'wrong-first', exam_type: 'MID_TERM', exam_date: '2026-10-22', venue: 'Hall Z' },
      { exam_schedule_id: 'selected-schedule', exam_type: 'MID_TERM', exam_date: '2026-10-23', venue: 'Hall A' },
    ];
    if (path === '/api/exam-cell/blocks-halls') return [{ block: 'Block A', halls: [{ name: 'Hall A', rows: 2, cols: 3, capacity: 6 }] }];
    if (path.startsWith('/api/exam-cell/branches')) return [];
    if (path === '/api/exam-cell/seating-runs') return [];
    return [];
  });
}
function gradeData() {
  api.get.mockImplementation(async (path: string) => path.includes('/top-students') ? [] : [card('Current student')]);
}
beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.del.mockReset(); toast.error.mockReset(); toast.success.mockReset();
  auth.user = { roles: ['ExamCell'], primaryRole: '', role: '' };
});

describe('Seating planner request safety', () => {
  it('does not guess a schedule when publishing an entire exam', async () => {
    seatingData(); render(<SeatingPage />);
    await screen.findByText('Hall A');
    fireEvent.click(screen.getByRole('button', { name: 'Publish to student portal' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/specific schedule/i));
  });

  it('locks allocation and publishing while an allocation request is pending', async () => {
    seatingData(); const pending = deferred<{ allocated: number; run_id: string; allocations: ReturnType<typeof allocation>[] }>();
    api.post.mockReturnValue(pending.promise); render(<SeatingPage />);
    fireEvent.click(await screen.findByRole('checkbox'));
    const allocate = screen.getByRole('button', { name: 'Auto-allocate seats' });
    act(() => { fireEvent.click(allocate); fireEvent.click(allocate); fireEvent.click(screen.getByRole('button', { name: 'Publish to student portal' })); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(allocate).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish to student portal' })).toBeDisabled();
    await act(async () => pending.resolve({ allocated: 1, run_id: 'own-run', allocations: [allocation()] }));
  });

  it('shows the returned allocation, not a different user’s latest global run', async () => {
    seatingData(); api.post.mockResolvedValue({ allocated: 1, run_id: 'own-run', allocations: [allocation()] });
    const priorGet = api.get.getMockImplementation()!;
    let runReads = 0;
    api.get.mockImplementation((path: string) => path === '/api/exam-cell/seating-runs'
      ? Promise.resolve(++runReads === 1 ? [] : [{ run_id: 'other-run', allocations: [allocation('Wrong branch', 'Hall Z')], created_at: '2026-10-21', semester: 8 }])
      : priorGet(path));
    render(<SeatingPage />); fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Auto-allocate seats' }));
    await screen.findByText('Block A — Hall A');
    expect(screen.queryByText('Block — Hall Z')).toBeNull();
    expect(api.get.mock.calls.filter(([path]) => path === '/api/exam-cell/seating-runs')).toHaveLength(2);
  });

  it('shows a retryable runs failure separately from genuine empty history', async () => {
    seatingData(); const priorGet = api.get.getMockImplementation()!;
    api.get.mockImplementation((path: string) => path === '/api/exam-cell/seating-runs' ? Promise.reject(new Error('History unavailable')) : priorGet(path));
    render(<SeatingPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable');
    expect(screen.queryByText('No seating plans yet')).toBeNull();
    api.get.mockImplementation(priorGet);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    await screen.findByText('No seating plans yet');
  });

  it('requires an explicit schedule and publishes only the chosen schedule once', async () => {
    seatingData(); const pending = deferred<{ published_rooms: number }>(); api.post.mockReturnValue(pending.promise);
    render(<SeatingPage />); await screen.findByText('Hall A');
    fireEvent.click(screen.getByRole('button', { name: 'Specific schedule' }));
    expect(screen.getByLabelText('Exam schedule')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Publish to student portal' }));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Exam schedule'), { target: { value: 'selected-schedule' } });
    const publish = screen.getByRole('button', { name: 'Publish to student portal' });
    act(() => { fireEvent.click(publish); fireEvent.click(publish); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/seating/publish-plans', { exam_schedule_id: 'selected-schedule' });
    expect(screen.getByLabelText('Exam schedule')).toBeDisabled();
    await act(async () => pending.resolve({ published_rooms: 1 }));
  });

  it('swaps only the allocated specific schedule and prevents duplicate swap requests', async () => {
    seatingData(); const second = { ...allocation(), student_user_id: 'second-student', student_name: 'Second synthetic student', seat_number: '02' };
    const pending = deferred<unknown>();
    api.post.mockResolvedValueOnce({ allocated: 2, run_id: 'own-run', allocations: [allocation(), second] }).mockReturnValueOnce(pending.promise);
    render(<SeatingPage />); await screen.findByText('Hall A');
    fireEvent.click(screen.getByRole('button', { name: 'Specific schedule' }));
    fireEvent.change(screen.getByLabelText('Exam schedule'), { target: { value: 'selected-schedule' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Auto-allocate seats' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Manually swap student' }));
    fireEvent.change(screen.getByLabelText('Student A'), { target: { value: 'synthetic-student' } });
    fireEvent.change(screen.getByLabelText('Student B'), { target: { value: 'second-student' } });
    const swap = screen.getByRole('button', { name: 'Swap seats' });
    act(() => { fireEvent.click(swap); fireEvent.click(swap); });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith('/api/exam-cell/seating/swap', {
      exam_schedule_id: 'selected-schedule', room: 'Hall A', student_user_id_a: 'synthetic-student', student_user_id_b: 'second-student',
    });
    expect(swap).toBeDisabled();
    await act(async () => pending.resolve({ swapped: true }));
  });

  it('does not report a committed swap as failed when only its refresh fails', async () => {
    seatingData(); const second = { ...allocation(), student_user_id: 'second-student', student_name: 'Second synthetic student', seat_number: '02' };
    const priorGet = api.get.getMockImplementation()!;
    api.get.mockImplementation((path: string) => path.startsWith('/api/exam-cell/seating-allocations') ? Promise.reject(new Error('Refresh unavailable')) : priorGet(path));
    api.post.mockResolvedValueOnce({ allocated: 2, run_id: 'own-run', allocations: [allocation(), second] }).mockResolvedValueOnce({ swapped: true });
    render(<SeatingPage />); await screen.findByText('Hall A');
    fireEvent.click(screen.getByRole('button', { name: 'Specific schedule' }));
    fireEvent.change(screen.getByLabelText('Exam schedule'), { target: { value: 'selected-schedule' } });
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Auto-allocate seats' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Manually swap student' }));
    fireEvent.change(screen.getByLabelText('Student A'), { target: { value: 'synthetic-student' } });
    fireEvent.change(screen.getByLabelText('Student B'), { target: { value: 'second-student' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Swap seats' })));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/saved.*refresh/i));
    expect(screen.queryByRole('button', { name: 'Manually swap student' })).toBeNull();
  });
});

describe('Grade-card request safety', () => {
  it.each(['ExamOperator', 'Admin'])('keeps %s read-only and hides result mutations', async (role) => {
    auth.user = { roles: [role], primaryRole: '', role: '' };
    gradeData(); render(<GradeCardsPage />); await screen.findAllByText('Current student');
    expect(screen.queryByRole('button', { name: 'Generate provisional batch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish provisional' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize marksheets' })).toBeNull();
    expect(screen.getByText(/read-only access/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download grade card PDF for Current student' })).not.toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('allows ExamAdmin to generate while keeping publication and finalization unavailable', async () => {
    auth.user = { roles: ['ExamAdmin'], primaryRole: '', role: '' };
    gradeData(); api.post.mockResolvedValue({ generated_count: 1 }); render(<GradeCardsPage />);
    await screen.findAllByText('Current student');
    expect(screen.queryByRole('button', { name: 'Publish provisional' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize marksheets' })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate provisional batch' })));
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/grade-cards/generate', { semester: 4 });
  });

  it.each(['primaryRole', 'role'] as const)('recognizes authorized %s alongside a lower-permission role collection', async (field) => {
    auth.user = { roles: ['ExamOperator'], primaryRole: '', role: '', [field]: 'DeputyCOE' };
    gradeData(); render(<GradeCardsPage />); await screen.findAllByText('Current student');
    expect(screen.getByRole('button', { name: 'Generate provisional batch' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish provisional' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalize marksheets' })).not.toBeDisabled();
  });

  it('serializes generate, publish, finalize and refresh requests', async () => {
    gradeData(); const pending = deferred<{ generated_count: number }>(); api.post.mockReturnValue(pending.promise);
    render(<GradeCardsPage />); await screen.findAllByText('Current student');
    const generate = screen.getByRole('button', { name: 'Generate provisional batch' });
    const publish = screen.getByRole('button', { name: 'Publish provisional' });
    const finalize = screen.getByRole('button', { name: 'Finalize marksheets' });
    act(() => { fireEvent.click(generate); fireEvent.click(generate); fireEvent.click(publish); fireEvent.click(finalize); });
    expect(api.post).toHaveBeenCalledTimes(1);
    for (const button of [generate, publish, finalize, screen.getByRole('button', { name: 'Refresh' })]) expect(button).toBeDisabled();
    expect(screen.getByLabelText('Semester')).toBeDisabled();
    await act(async () => pending.resolve({ generated_count: 1 }));
  });

  it('rejects stale semester responses and prevents actions while loading', async () => {
    const old = deferred<ReturnType<typeof card>[]>();
    api.get.mockImplementation((path: string) => path.includes('/top-students') ? Promise.resolve([])
      : path.includes('semester=4') ? old.promise : Promise.resolve([card('Semester five student', 5)]));
    render(<GradeCardsPage />);
    expect(screen.getByRole('button', { name: 'Generate provisional batch' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    await screen.findAllByText('Semester five student');
    await act(async () => old.resolve([card('Stale semester four student')]));
    expect(screen.queryByText('Stale semester four student')).toBeNull();
    expect(screen.getByLabelText('Semester')).toHaveValue(5);
  });

  it('clears stale cards and reports a retryable request failure instead of an empty semester', async () => {
    gradeData(); render(<GradeCardsPage />); await screen.findAllByText('Current student');
    api.get.mockRejectedValue(new Error('Grade cards unavailable'));
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '5' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Grade cards unavailable');
    expect(screen.queryByText('Current student')).toBeNull();
    expect(screen.queryByText('No grade cards yet. Generate a provisional batch for this semester.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate provisional batch' })).toBeDisabled();
    api.get.mockResolvedValue([]);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    await screen.findByText('No grade cards yet. Generate a provisional batch for this semester.');
  });

  it('releases the action guard after a confirmed failure so staff can retry', async () => {
    gradeData(); api.post.mockRejectedValueOnce(new Error('Generation rejected')).mockResolvedValueOnce({ generated_count: 1 });
    render(<GradeCardsPage />); await screen.findAllByText('Current student');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate provisional batch' })));
    expect(toast.error).toHaveBeenCalledWith('Generation rejected');
    expect(screen.getByRole('button', { name: 'Generate provisional batch' })).not.toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate provisional batch' })));
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});

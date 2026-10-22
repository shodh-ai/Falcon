import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyBacklogPage from '@/app/(portals)/faculty/backlog/page';
import DeanBacklogPage from '@/app/(portals)/dean/exams/backlog/page';

const { api, auth, toast } = vi.hoisted(() => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, auth: { api, user: { roles: ['Faculty'] as string[], primaryRole: '', role: '' } }, toast: { success: vi.fn(), error: vi.fn() } };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
const attempt = (name = 'Synthetic retake student', marks: number | null = null, marksStatus = 'DRAFT') => ({ attempt_id: name, student_name: name, course_code: 'SYN-RETAKE', course_name: 'Synthetic course', semester: 4, attempt_number: 2, source_exam_type: 'END_TERM', status: 'APPROVED', marks_status: marksStatus, marks_obtained: marks, max_marks: 50 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { api.get.mockReset().mockResolvedValue([]); api.post.mockReset(); toast.success.mockReset(); toast.error.mockReset(); auth.api = api; auth.user = { roles: ['Faculty'], primaryRole: '', role: '' }; });

describe('Faculty retake marks', () => {
  it('shows and retries a failed assignment request separately from a genuine empty list', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic assignments unavailable')).mockResolvedValueOnce([]);
    render(<FacultyBacklogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic assignments unavailable');
    expect(screen.queryByText('No retake assignments available.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry assigned retakes' }));
    expect(await screen.findByText('No retake assignments available.')).toBeTruthy();
  });
  it('requires an explicit valid score and accepts zero, saves once and reloads the real record', async () => {
    api.get.mockResolvedValueOnce([attempt()]).mockResolvedValueOnce([attempt(undefined, 0)]);
    const pending = deferred<object>(); api.post.mockReturnValue(pending.promise);
    render(<FacultyBacklogPage />);
    const input = await screen.findByLabelText('Marks for Synthetic retake student (maximum 50)');
    fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '51' } }); fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0' } });
    const save = screen.getByRole('button', { name: 'Save marks' });
    act(() => { fireEvent.click(save); fireEvent.click(save); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/academics/faculty/backlog/attempts/Synthetic retake student/marks', { marks_obtained: 0 });
    expect(input).toBeDisabled(); expect(toast.success).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ marks_obtained: 0 }));
    expect(await screen.findByRole('button', { name: 'Submit for review' })).toBeEnabled();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it('requires edited scores to be saved before a single submit request', async () => {
    api.get.mockResolvedValue([attempt(undefined, 30)]); api.post.mockReturnValue(new Promise(() => {}));
    render(<FacultyBacklogPage />);
    const input = await screen.findByLabelText('Marks for Synthetic retake student (maximum 50)');
    fireEvent.change(input, { target: { value: '31' } }); fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(toast.error).toHaveBeenCalledWith('Save the edited marks before submitting'); expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '30' } });
    const submit = screen.getByRole('button', { name: 'Submit for review' });
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/academics/faculty/backlog/attempts/Synthetic retake student/submit', {});
    expect(submit).toBeDisabled();
  });
  it('does not expose mark editing after submission or to an unrelated role', async () => {
    auth.user.roles = ['Student']; api.get.mockResolvedValue([attempt(undefined, 30, 'SUBMITTED')]);
    render(<FacultyBacklogPage />); await screen.findByText('Synthetic retake student');
    expect(screen.queryByRole('button', { name: 'Save marks' })).toBeNull(); expect(screen.queryByRole('spinbutton')).toBeNull();
  });
  it('ignores a stale assignment response after the authenticated API changes', async () => {
    const old = deferred<object[]>(); api.get.mockReturnValue(old.promise);
    const { rerender } = render(<FacultyBacklogPage />);
    auth.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() }; rerender(<FacultyBacklogPage />);
    await screen.findByText('No retake assignments available.');
    await act(async () => old.resolve([attempt('Previous session student')]));
    expect(screen.queryByText('Previous session student')).toBeNull();
  });
});

describe('Dean retake approvals', () => {
  beforeEach(() => { auth.user.roles = ['Dean']; });
  it('shows a queue failure and retries without claiming there are no approvals', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic Dean queue unavailable')).mockResolvedValueOnce([]);
    render(<DeanBacklogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic Dean queue unavailable');
    expect(screen.queryByText('No retake results pending your approval.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry retake approvals' }));
    expect(await screen.findByText('No retake results pending your approval.')).toBeTruthy();
  });
  it('approves one COE-reviewed record once and reloads the scoped queue', async () => {
    api.get.mockResolvedValueOnce([attempt(undefined, 40, 'COE_APPROVED')]).mockResolvedValueOnce([]);
    const pending = deferred<object>(); api.post.mockReturnValue(pending.promise);
    render(<DeanBacklogPage />);
    const approve = await screen.findByRole('button', { name: 'Approve retake result for Synthetic retake student' });
    act(() => { fireEvent.click(approve); fireEvent.click(approve); });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/exam-cell/backlog/attempts/Synthetic retake student/dean-approval', {});
    expect(approve).toBeDisabled(); expect(toast.success).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ marks_status: 'DEAN_APPROVED' }));
    expect(await screen.findByText('No retake results pending your approval.')).toBeTruthy();
  });
  it('keeps unsupported roles read-only and never approves an earlier review stage', async () => {
    auth.user.roles = ['ExamOperator']; api.get.mockResolvedValue([attempt(undefined, 40, 'SUBMITTED')]);
    render(<DeanBacklogPage />); await screen.findByText('Synthetic retake student');
    expect(screen.queryByRole('button', { name: /Approve retake result/ })).toBeNull(); expect(api.post).not.toHaveBeenCalled();
  });
  it('keeps a failed approval visible and does not claim publication or success', async () => {
    api.get.mockResolvedValue([attempt(undefined, 40, 'COE_APPROVED')]); api.post.mockRejectedValue(new Error('Synthetic approval denied'));
    render(<DeanBacklogPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve retake result for Synthetic retake student' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic approval denied'));
    expect(toast.success).not.toHaveBeenCalled(); expect(screen.getByText('COE_APPROVED')).toBeTruthy();
  });
});

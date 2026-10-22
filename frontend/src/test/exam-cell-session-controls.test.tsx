import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamCellSessionsPage from '@/app/(portals)/exam-cell/sessions/page';

const { api, toast, auth } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
  auth: { user: { roles: ['examcell'] } },
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

beforeEach(() => {
  api.get.mockReset().mockResolvedValue([]);
  api.post.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  auth.user.roles = ['examcell'];
});

describe('Examination session controls', () => {
  it('formats API timestamps as readable dates and handles missing or invalid dates', async () => {
    const start = '2026-10-31T18:30:00.000Z';
    const end = '2026-11-29T18:30:00.000Z';
    api.get.mockResolvedValue([
      { session_id: 'dated', session_name: 'Dated exam', academic_year: '2026-27', cycle_type: 'END_SEMESTER', semester: 4, status: 'CLOSED', start_date: start, end_date: end },
      { session_id: 'undated', session_name: 'Undated exam', academic_year: '2026-27', cycle_type: 'END_SEMESTER', semester: 4, status: 'DRAFT', start_date: null, end_date: 'invalid-date' },
    ]);
    render(<ExamCellSessionsPage />);
    const expectedDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    expect(await screen.findByText(`${expectedDate(start)} → ${expectedDate(end)}`)).toBeTruthy();
    expect(screen.getByText('— → —')).toBeTruthy();
    expect(screen.queryByText(/T18:30:00\.000Z/)).toBeNull();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it('keeps API errors distinct from a genuinely empty list and supports retry', async () => {
    api.get.mockRejectedValueOnce(new Error('Sessions unavailable'));
    render(<ExamCellSessionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessions unavailable');
    expect(screen.queryByText('No examination sessions configured.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No examination sessions configured.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('labels the form and prevents a duplicate create while its request is pending', async () => {
    let finishCreate!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finishCreate = resolve; }));
    render(<ExamCellSessionsPage />);
    await screen.findByText('No examination sessions configured.');
    fireEvent.change(screen.getByLabelText('Session name'), { target: { value: 'Synthetic end semester' } });
    expect(screen.getByLabelText('Academic year')).toBeTruthy();
    expect(screen.getByLabelText('Examination cycle')).toBeTruthy();
    expect(screen.getByLabelText('Start date')).toBeTruthy();
    expect(screen.getByLabelText('End date')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Create session' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Creating session…' })).toBeDisabled();
    await act(async () => { finishCreate({}); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled());
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/sessions', expect.objectContaining({ session_name: 'Synthetic end semester', semester: 4 }));
  });

  it('prevents repeated status requests and keeps restricted roles read only', async () => {
    api.get.mockResolvedValue([{
      session_id: 'synthetic-session', session_name: 'Synthetic exam', academic_year: '2026-27',
      cycle_type: 'END_SEMESTER', semester: 4, program_label: 'B.Tech', start_date: null, end_date: null, status: 'DRAFT',
    }]);
    let finishUpdate!: (value: object) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finishUpdate = resolve; }));
    const { unmount } = render(<ExamCellSessionsPage />);
    const open = await screen.findByRole('button', { name: 'Open' });
    fireEvent.click(open);
    fireEvent.click(open);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    await act(async () => { finishUpdate({}); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled());
    unmount();
    auth.user.roles = ['examoperator'];
    render(<ExamCellSessionsPage />);
    await screen.findByText('Synthetic exam');
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create session' })).toBeNull();
  });
});

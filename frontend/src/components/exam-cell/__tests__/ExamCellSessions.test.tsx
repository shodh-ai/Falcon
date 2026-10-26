import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionsPage from '@/app/(portals)/exam-cell/sessions/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));

const session = {
  session_id: 'session-a', academic_year: '2026-27', session_name: 'Test session',
  cycle_type: 'END_SEMESTER', semester: 4, program_label: null,
  start_date: null, end_date: null, status: 'DRAFT',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.role = 'ExamCell';
  mocks.user.primaryRole = 'ExamCell';
  mocks.api.get.mockResolvedValue([]);
  mocks.api.post.mockResolvedValue(session);
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Session name'), { target: { value: ' Test session ' } });
  fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: '2026-27' } });
}

describe('Exam Cell session UI', () => {
  it('creates a real draft request with no invented academic defaults and reloads saved data', async () => {
    mocks.api.get.mockResolvedValueOnce([]).mockResolvedValue([session]);
    render(<SessionsPage />);
    expect(await screen.findByText('No examination sessions configured.')).toBeVisible();
    expect(screen.getByLabelText('Academic year')).toHaveValue('');
    expect(screen.getByLabelText('Semester')).toHaveValue(null);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByText('Test session')).toBeVisible();
    expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/sessions', {
      academic_year: '2026-27', session_name: 'Test session', cycle_type: 'END_SEMESTER',
      program_label: undefined, semester: undefined, start_date: undefined, end_date: undefined,
    });
    expect(mocks.success).toHaveBeenCalledWith('Exam session created');
  });

  it('prevents duplicate submissions while saving', async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.post.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<SessionsPage />);
    await screen.findByText('No examination sessions configured.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(session); });
  });

  it('rejects invalid required fields, semester, and reversed dates before API writes', async () => {
    render(<SessionsPage />);
    await screen.findByText('No examination sessions configured.');
    const create = screen.getByRole('button', { name: 'Create session' });
    fireEvent.click(create);
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '-1' } });
    fireEvent.click(create);
    expect(screen.getByRole('alert')).toHaveTextContent('positive whole number');
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-02' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-01' } });
    fireEvent.click(create);
    expect(screen.getByRole('alert')).toHaveTextContent('End date');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows read failures with retry, not an empty-success table', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue([]);
    render(<SessionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.queryByText('No examination sessions configured.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading sessions' }));
    expect(await screen.findByText('No examination sessions configured.')).toBeVisible();
  });

  it('shows mutation failure and preserves the form without success feedback', async () => {
    mocks.api.post.mockRejectedValue(new Error('Duplicate examination session'));
    render(<SessionsPage />);
    await screen.findByText('No examination sessions configured.');
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Duplicate examination session');
    expect(screen.getByLabelText('Session name')).toHaveValue(' Test session ');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('follows the existing draft → open → active → closed controls', async () => {
    mocks.api.get.mockResolvedValueOnce([session])
      .mockResolvedValueOnce([{ ...session, status: 'OPEN' }])
      .mockResolvedValueOnce([{ ...session, status: 'ACTIVE' }])
      .mockResolvedValue([{ ...session, status: 'CLOSED' }]);
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument());
    expect(await screen.findByText('CLOSED')).toBeVisible();
    expect(mocks.api.post.mock.calls).toEqual(['OPEN', 'ACTIVE', 'CLOSED'].map((status) => [
      '/api/exam-cell/sessions/session-a/status', { status },
    ]));
  });

  it('does not offer management controls to an active ExamOperator despite an extra assigned role', async () => {
    mocks.user.primaryRole = 'ExamOperator';
    mocks.api.get.mockResolvedValue([session]);
    render(<SessionsPage />);
    await screen.findByText('Test session');
    expect(screen.queryByRole('button', { name: 'Create session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('discards a late session list from the previous authenticated API context', async () => {
    const previousApi = mocks.api;
    let resolvePrevious!: (value: unknown) => void;
    previousApi.get.mockReturnValue(new Promise((done) => { resolvePrevious = done; }));
    const view = render(<SessionsPage />);
    try {
      mocks.api = { get: vi.fn().mockResolvedValue([{ ...session, session_name: 'Current tenant session' }]), post: vi.fn() };
      view.rerender(<SessionsPage />);
      expect(await screen.findByText('Current tenant session')).toBeVisible();
      await act(async () => { resolvePrevious([session]); });
      expect(screen.queryByText('Test session')).not.toBeInTheDocument();
      expect(screen.getByText('Current tenant session')).toBeVisible();
    } finally {
      mocks.api = previousApi;
    }
  });
});

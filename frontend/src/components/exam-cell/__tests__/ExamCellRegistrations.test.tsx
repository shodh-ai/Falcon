import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegistrationPage from '@/app/(portals)/exam-cell/form-fillup/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
// Exercise the page's request/state contract, not Radix's shared select implementation.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select>,
}));

const session = {
  session_id: 'session-a', session_name: 'Synthetic semester examination',
  semester: 6, program_label: 'Synthetic programme', status: 'OPEN',
};
const formWindow = {
  window_id: 'window-a', session_id: session.session_id, session_name: session.session_name,
  title: 'Synthetic registration window', semester: 6, program_label: session.program_label,
  opens_at: '2026-10-01T09:00:00Z', closes_at: '2026-11-01T18:00:00Z', status: 'OPEN',
};
const registration = {
  registration_id: 'registration-a', student_name: 'Synthetic Student', enrollment_number: 'TEST-001',
  semester: 6, fee_status: 'PAID', status: 'PENDING',
  eligibility_snapshot: {
    eligible: true, block_reasons: [],
    enrollments: [{ enrollment_id: 'enrollment-a', course_code: 'TEST101', course_name: 'Synthetic Course', subject_name: 'Synthetic Subject' }],
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.primaryRole = 'ExamCell';
  mocks.api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/sessions') return [session];
    if (path === '/api/exam-cell/form-windows') return [formWindow];
    if (path.startsWith('/api/exam-cell/registrations')) return [registration];
    throw new Error(`Unexpected path ${path}`);
  });
  mocks.api.post.mockResolvedValue({ created: 1, refreshed: 0, total_students: 1 });
});

async function selectSessionAndFillWindow() {
  await screen.findByText('Synthetic Student');
  fireEvent.change(screen.getByLabelText('Examination session'), { target: { value: session.session_id } });
  fireEvent.change(screen.getByLabelText('Window title'), { target: { value: ' Synthetic new window ' } });
  fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: '2026-10-22T09:00' } });
  fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '2026-10-25T18:00' } });
}

describe('Exam Cell verified registration desk', () => {
  it('creates a session-linked window with derived scope and explicit timezone instants', async () => {
    render(<RegistrationPage />);
    expect(screen.getByLabelText('Semester')).toHaveValue('');
    expect(screen.getByLabelText('Program')).toHaveValue('');
    await selectSessionAndFillWindow();
    expect(screen.getByLabelText('Semester')).toHaveValue('6');
    expect(screen.getByLabelText('Program')).toHaveValue('Synthetic programme');
    expect(screen.getByLabelText('Semester')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Create window' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/form-windows', {
      title: 'Synthetic new window', session_id: 'session-a', semester: 6,
      program_label: 'Synthetic programme',
      opens_at: new Date('2026-10-22T09:00').toISOString(),
      closes_at: new Date('2026-10-25T18:00').toISOString(),
    }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Form window created'));
  });

  it('does not offer closed or archived sessions or invent missing session scope', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [
      { ...session, status: 'CLOSED' },
      { ...session, session_id: 'session-b', program_label: null },
      { ...session, session_id: 'session-c', semester: null },
      { ...session, session_id: 'session-d', status: 'ARCHIVED' },
    ] : []);
    render(<RegistrationPage />);
    expect(await screen.findByText(/No available examination session has a configured semester and program/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create window' })).toBeDisabled();
    expect(within(screen.getByLabelText('Examination session')).getAllByRole('option')).toHaveLength(1);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('keeps All windows selected and uses exact filter contracts', async () => {
    render(<RegistrationPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.getByLabelText('Registration window')).toHaveValue('');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/registrations');
    fireEvent.change(screen.getByLabelText('Registration window'), { target: { value: 'window-a' } });
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/registrations?window_id=window-a'));
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Registration window'), { target: { value: '' } });
    await screen.findByText('Synthetic Student');
    expect(screen.getByLabelText('Registration window')).toHaveValue('');
  });

  it('shows verified course membership and requires a server recheck for unknown or blocked eligibility', async () => {
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      return [registration,
        { ...registration, registration_id: 'unknown', student_name: 'Unknown Student', eligibility_snapshot: null },
        { ...registration, registration_id: 'blocked', student_name: 'Blocked Student', eligibility_snapshot: { eligible: false, block_reasons: ['Finance clearance unavailable'] } },
      ];
    });
    render(<RegistrationPage />);
    expect(await screen.findByText('TEST101 — Synthetic Course')).toBeVisible();
    expect(within(screen.getByRole('row', { name: /Synthetic Student/ })).getByRole('button', { name: 'Approve' })).toBeEnabled();
    const unknown = within(screen.getByRole('row', { name: /Unknown Student/ }));
    expect(unknown.getAllByText('Not verified').length).toBeGreaterThan(0);
    expect(unknown.queryByRole('button', { name: 'Approve', exact: true })).not.toBeInTheDocument();
    expect(unknown.getByRole('button', { name: 'Recheck & approve' })).toBeEnabled();
    const blocked = within(screen.getByRole('row', { name: /Blocked Student/ }));
    expect(blocked.getByText('Finance clearance unavailable')).toBeVisible();
    expect(blocked.queryByRole('button', { name: 'Approve', exact: true })).not.toBeInTheDocument();
    fireEvent.click(blocked.getByRole('button', { name: 'Recheck & approve' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/registrations/blocked/review', { status: 'APPROVED' }));
    await waitFor(() => expect(within(screen.getByRole('row', { name: /Unknown Student/ })).getByRole('button', { name: 'Recheck & approve' })).toBeEnabled());
    fireEvent.click(within(screen.getByRole('row', { name: /Unknown Student/ })).getByRole('button', { name: 'Recheck & approve' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/registrations/unknown/review', { status: 'APPROVED' }));
  });

  it('can recheck a stored blocked registration after its window closes without resyncing registrations', async () => {
    let approved = false;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [{ ...formWindow, status: 'CLOSED' }];
      return [{ ...registration, status: approved ? 'APPROVED' : 'REJECTED', eligibility_snapshot: approved ? registration.eligibility_snapshot : { eligible: false, block_reasons: ['Earlier fee dues unresolved'] } }];
    });
    mocks.api.post.mockImplementation(async () => { approved = true; return {}; });
    render(<RegistrationPage />);
    expect(await screen.findByText('Earlier fee dues unresolved')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Registration window'), { target: { value: 'window-a' } });
    await screen.findByText('Earlier fee dues unresolved');
    expect(screen.getByRole('button', { name: 'Sync / refresh eligibility' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recheck & approve' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/registrations/registration-a/review', { status: 'APPROVED' }));
    await waitFor(() => expect(within(screen.getByRole('row', { name: /Synthetic Student/ })).getByText('APPROVED')).toBeVisible());
    expect(screen.queryByText('Earlier fee dues unresolved')).not.toBeInTheDocument();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes eligibility for the selected open window using its actual semester', async () => {
    render(<RegistrationPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Registration window'), { target: { value: 'window-a' } });
    const sync = await screen.findByRole('button', { name: 'Sync / refresh eligibility' });
    await waitFor(() => expect(sync).toBeEnabled());
    fireEvent.click(sync);
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/form-windows/window-a/sync-registrations', { semester: 6 }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Synced 1 registrations; refreshed 0 from 1 students'));
  });

  it('keeps closed-window sync disabled', async () => {
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [{ ...formWindow, status: 'CLOSED' }];
      return [registration];
    });
    render(<RegistrationPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Registration window'), { target: { value: 'window-a' } });
    await screen.findByText('Synthetic Student');
    expect(screen.getByRole('button', { name: 'Sync / refresh eligibility' })).toBeDisabled();
  });

  it('allows a rejected registration to be reviewed again only after verified refresh', async () => {
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      return [{ ...registration, status: 'REJECTED' }];
    });
    render(<RegistrationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/registrations/registration-a/review', { status: 'APPROVED' }));
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows upstream failure instead of a false empty-success result and allows retry', async () => {
    mocks.api.get.mockRejectedValue(new Error('Official enrollment service unavailable'));
    render(<RegistrationPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Official enrollment service unavailable');
    expect(screen.queryByText('No form windows configured. Create one above.')).not.toBeInTheDocument();
    expect(screen.queryByText('No registrations yet. Open a window and sync students.')).not.toBeInTheDocument();
    mocks.api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading registration desk' }));
    expect(await screen.findByText('No registrations yet. Open a window and sync students.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves a backend eligibility rejection visibly without claiming approval', async () => {
    mocks.api.post.mockRejectedValue(new Error('Student attendance eligibility could not be verified'));
    render(<RegistrationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Student attendance eligibility could not be verified');
    expect(mocks.error).toHaveBeenCalledWith('Student attendance eligibility could not be verified');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole('row', { name: /Synthetic Student/ })).getByText('PENDING')).toBeVisible();
  });

  it('prevents duplicate clicks and changing filters while a mutation is pending', async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.post.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<RegistrationPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Registration window')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await act(async () => { resolve({}); });
  });

  it('uses the active role rather than another assigned role for write controls', async () => {
    mocks.user.primaryRole = 'ExamOperator';
    render(<RegistrationPage />);
    await screen.findByText('Synthetic Student');
    expect(screen.queryByRole('button', { name: 'Create window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('rejects reversed registration dates and preserves form data after write failure', async () => {
    render(<RegistrationPage />);
    await selectSessionAndFillWindow();
    fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '2026-10-20T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create window' }));
    expect(screen.getByRole('alert')).toHaveTextContent('closing date must be after');
    expect(mocks.api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '2026-10-25T18:00' } });
    mocks.api.post.mockRejectedValue(new Error('Duplicate registration window'));
    fireEvent.click(screen.getByRole('button', { name: 'Create window' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Duplicate registration window'));
    expect(screen.getByLabelText('Window title')).toHaveValue(' Synthetic new window ');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('rejects invalid date input before making a create request', async () => {
    render(<RegistrationPage />);
    await selectSessionAndFillWindow();
    // Browsers sanitize invalid datetime-local values to an empty string.
    fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: 'not-a-date' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create window' }));
    expect(screen.getByRole('alert')).toHaveTextContent('enter the title and registration dates');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('ignores a late response for a previously selected registration filter', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      if (path.includes('status=PENDING')) return new Promise((done) => { resolveOld = done; });
      if (path.includes('status=APPROVED')) return [{ ...registration, status: 'APPROVED', student_name: 'Current Student' }];
      return [registration];
    });
    render(<RegistrationPage />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Registration status'), { target: { value: 'PENDING' } });
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/registrations?status=PENDING'));
    fireEvent.change(screen.getByLabelText('Registration status'), { target: { value: 'APPROVED' } });
    expect(await screen.findByText('Current Student')).toBeVisible();
    await act(async () => { resolveOld([registration]); });
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
  });

  it('does not reuse a previous authenticated API context after it changes', async () => {
    const previousApi = mocks.api;
    let resolvePrevious!: (value: unknown) => void;
    previousApi.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      return new Promise((done) => { resolvePrevious = done; });
    });
    const view = render(<RegistrationPage />);
    try {
      mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
      view.rerender(<RegistrationPage />);
      expect(await screen.findByText('No registrations yet. Open a window and sync students.')).toBeVisible();
      await act(async () => { resolvePrevious([registration]); });
      expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Examination session')).toHaveValue('');
    } finally {
      mocks.api = previousApi;
    }
  });

  it('shows a loading state during manual refresh and preserves the current draft', async () => {
    render(<RegistrationPage />);
    await selectSessionAndFillWindow();
    let resolveRefresh!: (value: unknown) => void;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      return new Promise((done) => { resolveRefresh = done; });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
    expect(screen.getByLabelText('Loading registrations')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create window' })).toBeDisabled();
    expect(screen.getByLabelText('Window title')).toHaveValue(' Synthetic new window ');
    await act(async () => { resolveRefresh([registration]); });
    expect(await screen.findByText('Synthetic Student')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    expect(screen.getByLabelText('Examination session')).toHaveValue(session.session_id);
  });

  it('resets the draft and action error only when the authenticated API changes', async () => {
    const previousApi = mocks.api;
    const view = render(<RegistrationPage />);
    await selectSessionAndFillWindow();
    mocks.api.post.mockRejectedValue(new Error('Previous context validation error'));
    fireEvent.click(screen.getByRole('button', { name: 'Create window' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Previous context validation error');
    view.rerender(<RegistrationPage />);
    expect(screen.getByLabelText('Window title')).toHaveValue(' Synthetic new window ');
    expect(screen.getByRole('alert')).toHaveTextContent('Previous context validation error');
    let resolveNext!: (value: unknown) => void;
    const nextResponse = new Promise((done) => { resolveNext = done; });
    try {
      mocks.api = { get: vi.fn().mockReturnValue(nextResponse), post: vi.fn() };
      view.rerender(<RegistrationPage />);
      // Old credentials' draft/error must disappear even before the new fetch completes.
      expect(screen.getByLabelText('Loading registrations')).toBeVisible();
      expect(screen.getByLabelText('Window title')).toHaveValue('');
      expect(screen.getByLabelText('Opens at')).toHaveValue('');
      expect(screen.getByLabelText('Closes at')).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => { resolveNext([]); });
      expect(await screen.findByText('No registrations yet. Open a window and sync students.')).toBeVisible();
      expect(mocks.api.post).not.toHaveBeenCalled();
    } finally {
      mocks.api = previousApi;
    }
  });

  it('keeps the loading indicator while reloading after a successful registration mutation', async () => {
    render(<RegistrationPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    let resolveReload!: (value: unknown) => void;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/form-windows') return [formWindow];
      return new Promise((done) => { resolveReload = done; });
    });
    fireEvent.click(approve);
    expect(await screen.findByLabelText('Loading registrations')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    await act(async () => { resolveReload([{ ...registration, status: 'APPROVED' }]); });
    expect(await screen.findByText('APPROVED')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  });

  it('ignores a pending load failure after unmount without showing a stale error', async () => {
    let rejectLoad!: (reason: Error) => void;
    const pending = new Promise((_, reject) => { rejectLoad = reject; });
    mocks.api.get.mockReturnValue(pending);
    const view = render(<RegistrationPage />);
    view.unmount();
    await act(async () => { rejectLoad(new Error('Cancelled context request')); });
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

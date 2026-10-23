import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyResearchApprovalsPage from '../page';

const fixtures = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() } }));
const first = { application_id: 'grant-1', project_title: 'First proposal', student_name: 'First Student', status: 'PENDING_GUIDE', documents: {}, submitted_at: '2026-10-19' };
const second = { ...first, application_id: 'grant-2', project_title: 'Second proposal', student_name: 'Second Student' };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'faculty-1', tenant_id: 'tenant-1' }, token: 'test-token' }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({ withFacultyDemoFallback: (live: unknown) => live, isEmptyArray: (value: unknown) => Array.isArray(value) && !value.length, isFacultyDemoSmokeId: () => false }));
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn().mockResolvedValue([first, second]), post: vi.fn().mockResolvedValue({}) };
});
afterEach(cleanup);
function row(title: string) { return screen.getByText(title).parentElement!; }
function remarks(title = 'First proposal') { return within(row(title)).getByPlaceholderText('Remarks (required for reject)'); }
function approve(title = 'First proposal') { return within(row(title)).getByRole('button', { name: 'Approve' }); }

describe('research grant review integrity', () => {
  it('shows the proposal budget and programme without approving or rejecting anything', async () => {
    fixtures.api.get.mockResolvedValue([{ ...first, requested_budget: '18000', config_title: 'Research grant call' }]);
    render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    expect(screen.getByText('₹18,000.00')).toBeInTheDocument();
    expect(screen.getByText('Research grant call')).toBeInTheDocument();
    expect(screen.getByText('No supporting documents submitted.')).toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('distinguishes read loading, failure with retry, and a successful empty queue', async () => {
    let reject!: (error: Error) => void;
    fixtures.api.get.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    render(<FacultyResearchApprovalsPage />);
    expect(screen.getByText('Loading research approvals…')).toBeInTheDocument();
    expect(screen.queryByText('No applications awaiting your review.')).not.toBeInTheDocument();
    await act(async () => { reject(new Error('Queue unavailable')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Queue unavailable');
    expect(screen.queryByText('No applications awaiting your review.')).not.toBeInTheDocument();
    fixtures.api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry approvals' }));
    await screen.findByText('No applications awaiting your review.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('only offers actions for proposals actually awaiting guide review', async () => {
    fixtures.api.get.mockResolvedValue([first, { ...second, status: 'PENDING_BUDGET' }]);
    render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    expect(screen.queryByText('Second proposal')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
  });

  it('prevents same-tick approval duplicates, trims remarks and locks all review controls', async () => {
    let resolve!: (result: object) => void;
    fixtures.api.post.mockReturnValue(new Promise<object>((done) => { resolve = done; }));
    render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    fireEvent.change(remarks(), { target: { value: '  Technically valid  ' } });
    const button = approve();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith('/api/academic-rnd/approvals/guide/grant-1/approve', { remarks: 'Technically valid' });
    for (const input of screen.getAllByPlaceholderText('Remarks (required for reject)')) expect(input).toBeDisabled();
    for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled();
    fixtures.api.get.mockResolvedValue([second]);
    await act(async () => { resolve({}); });
  });

  it('requires nonblank rejection remarks and preserves them if the request fails', async () => {
    fixtures.api.post.mockRejectedValue(new Error('Decision unavailable'));
    render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    fireEvent.change(remarks(), { target: { value: '   ' } });
    fireEvent.click(within(row('First proposal')).getByRole('button', { name: 'Reject' }));
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.error).toHaveBeenCalledWith('Remarks required for rejection');
    fireEvent.change(remarks(), { target: { value: '  Clarify methodology  ' } });
    fireEvent.click(within(row('First proposal')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Decision unavailable'));
    expect(fixtures.api.post).toHaveBeenCalledWith('/api/academic-rnd/approvals/guide/grant-1/reject', { remarks: 'Clarify methodology' });
    expect(remarks()).toHaveValue('  Clarify methodology  ');
    expect(approve()).toBeEnabled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });

  it('removes a completed approval before refresh and never restores its action on refresh failure', async () => {
    fixtures.api.get.mockResolvedValueOnce([first, second]).mockRejectedValueOnce(new Error('Refresh unavailable'));
    render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    fireEvent.click(approve());
    expect(await screen.findByRole('alert')).toHaveTextContent('Decision saved, but the remaining queue could not be refreshed. Refresh unavailable');
    expect(screen.queryByText('First proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Second proposal')).toBeInTheDocument();
    expect(approve('Second proposal')).toBeDisabled();
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Technical review approved — forwarded to Finance');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
    fixtures.api.get.mockResolvedValue([second]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry approvals' }));
    await waitFor(() => expect(approve('Second proposal')).toBeEnabled());
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });

  it('ignores a previous account queue response after changing API scope', async () => {
    let resolve!: (rows: typeof first[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof first[]>((done) => { resolve = done; }));
    const view = render(<FacultyResearchApprovalsPage />);
    fixtures.api = { get: vi.fn().mockResolvedValue([second]), post: vi.fn() };
    view.rerender(<FacultyResearchApprovalsPage />);
    await screen.findByText('Second proposal');
    await act(async () => { resolve([first]); });
    expect(screen.queryByText('First proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Second proposal')).toBeInTheDocument();
  });

  it('ignores a previous account decision response without refreshing or clearing a new draft', async () => {
    let resolve!: (value: object) => void;
    const oldApi = fixtures.api;
    oldApi.get.mockResolvedValue([first]);
    oldApi.post.mockReturnValue(new Promise<object>((done) => { resolve = done; }));
    const view = render(<FacultyResearchApprovalsPage />);
    await screen.findByText('First proposal');
    fireEvent.click(approve());
    fixtures.api = { get: vi.fn().mockResolvedValue([second]), post: vi.fn() };
    view.rerender(<FacultyResearchApprovalsPage />);
    await screen.findByText('Second proposal');
    fireEvent.change(remarks('Second proposal'), { target: { value: 'New account notes' } });
    await act(async () => { resolve({}); });
    expect(remarks('Second proposal')).toHaveValue('New account notes');
    expect(approve('Second proposal')).toBeEnabled();
    expect(oldApi.get).toHaveBeenCalledTimes(1);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
  });
});

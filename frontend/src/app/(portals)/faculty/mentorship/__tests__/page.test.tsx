import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MentorshipPage from '../page';

const state = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), getBlob: vi.fn() },
  user: { user_id: 'faculty-one', tenant_id: 'tenant-one' },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({ isEmptyArray: (value: unknown) => Array.isArray(value) && !value.length,
  isFacultyDemoSmokeId: () => false, withFacultyDemoFallback: (value: unknown) => value }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>, FacultyMetricChip: () => null,
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyEmptyState: ({ description }: { description: string }) => <p>{description}</p>,
}));
vi.mock('@/components/brand/FalconLoader', () => ({ FalconLoader: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock('@/components/mentorship/PendingMeetingRequests', () => ({ PendingMeetingRequests: ({ onUpdated }: { onUpdated: () => void }) => <button onClick={onUpdated}>Refresh mentorship</button> }));
vi.mock('@/components/mentorship/PendingLeaveRequests', () => ({ PendingLeaveRequests: () => null }));
vi.mock('@/components/mentorship/MentorshipChatMessenger', () => ({ MentorshipChatMessenger: () => null }));
vi.mock('@/components/ecell/EcellMentorInbox', () => ({ EcellMentorInbox: () => null }));

const mentee = { mentorship_id: 'mentee-one', student: { user_id: 'student-one', name: 'First mentee', email: 'student@example.test' } };
const certificate = { certificate_id: 'certificate-one', title: 'First certificate', issuer: 'Issuer', student: null };
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { user_id: 'faculty-one', tenant_id: 'tenant-one' };
  state.api = { get: vi.fn().mockImplementation(async (path: string) => path.endsWith('my-students') ? [mentee] : { certificates: [certificate] }), post: vi.fn().mockResolvedValue({}), getBlob: vi.fn() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('mentorship read and certificate state', () => {
  it('shows separate initial loading states without claiming empty sections', () => {
    state.api.get.mockReturnValue(new Promise(() => {}));
    render(<MentorshipPage />);
    expect(screen.getByText('Loading mentorship roster…')).toBeInTheDocument();
    expect(screen.getByText('Loading mentorship approvals…')).toBeInTheDocument();
    expect(screen.queryByText('No certificates are waiting for your review.')).not.toBeInTheDocument();
  });

  it('retries a failed approval read while preserving the independently loaded roster', async () => {
    state.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('my-students')) return [mentee];
      throw new Error('Approval service unavailable');
    });
    render(<MentorshipPage />);
    expect(await screen.findByText('First mentee')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Approval service unavailable');
    expect(screen.queryByText('No certificates are waiting for your review.')).not.toBeInTheDocument();
    state.api.get.mockResolvedValue({ certificates: [certificate] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry approvals' }));
    await screen.findByText('First certificate');
    expect(screen.getByText('First mentee')).toBeInTheDocument();
    expect(state.api.get.mock.calls.filter(([path]) => path.endsWith('my-students'))).toHaveLength(1);
  });

  it('locks certificate controls and sends only one same-tick decision', async () => {
    let resolve!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<MentorshipPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    act(() => { fireEvent.click(approve); fireEvent.click(approve); });
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(approve).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View' })).toBeDisabled();
    await act(async () => resolve({}));
    expect(screen.queryByText('First certificate')).not.toBeInTheDocument();
    expect(state.toast.success).toHaveBeenCalledWith('Certificate approved');
  });

  it('requires a nonblank rejection reason and preserves the pending certificate', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    render(<MentorshipPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(state.api.post).not.toHaveBeenCalled();
    expect(screen.getByText('First certificate')).toBeInTheDocument();
    expect(state.toast.error).toHaveBeenCalledWith('Enter a reason for rejection');
  });

  it('ignores old account reads after an account change', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.get.mockReturnValue(new Promise(resolve => { resolveOld = resolve; }));
    const rendered = render(<MentorshipPage />);
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockImplementation(async (path: string) => path.endsWith('my-students') ? [{ ...mentee, student: { ...mentee.student, name: 'New mentee' } }] : { certificates: [] }), post: vi.fn(), getBlob: vi.fn() };
    rendered.rerender(<MentorshipPage />);
    await screen.findByText('New mentee');
    await act(async () => resolveOld({ certificates: [certificate] }));
    expect(screen.queryByText('First certificate')).not.toBeInTheDocument();
    expect(screen.getByText('New mentee')).toBeInTheDocument();
  });

  it('does not affect the new account when an old certificate decision finishes', async () => {
    let resolveOld!: (value: unknown) => void;
    state.api.post.mockReturnValue(new Promise(resolve => { resolveOld = resolve; }));
    const rendered = render(<MentorshipPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    state.user = { user_id: 'faculty-two', tenant_id: 'tenant-two' };
    state.api = { get: vi.fn().mockImplementation(async (path: string) => path.endsWith('my-students') ? [] : { certificates: [{ ...certificate, title: 'New certificate' }] }), post: vi.fn(), getBlob: vi.fn() };
    rendered.rerender(<MentorshipPage />);
    await screen.findByText('New certificate');
    await act(async () => resolveOld({}));
    expect(screen.getByText('New certificate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(state.api.get).toHaveBeenCalledTimes(2);
  });

  it('keeps a successful certificate decision distinct from a later refresh failure', async () => {
    render(<MentorshipPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith('Certificate approved'));
    state.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('my-students')) return [mentee];
      throw new Error('Refresh unavailable');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh mentorship' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByText('First mentee')).toBeInTheDocument();
    expect(screen.queryByText('First certificate')).not.toBeInTheDocument();
    expect(state.toast.error).not.toHaveBeenCalled();
    expect(state.api.post).toHaveBeenCalledTimes(1);
  });
});

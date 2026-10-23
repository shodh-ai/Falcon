import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EventApprovalsPage from '@/app/(portals)/faculty/event-approvals/page';
import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() }, success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/safety' }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isFacultyDemoSmokeId: () => false,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  withFacultyDemoFallback: (value: unknown) => value,
}));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPageLoading: ({ label }: { label: string }) => <p>{label}</p>,
  FacultyEmptyState: ({ description }: { description: string }) => <p>{description}</p>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const events = [
  { event_id: 'event-one', title: 'First proposal', event_date: '2026-10-25T10:00:00Z', total_slots: 20 },
  { event_id: 'event-two', title: 'Second proposal', event_date: '2026-10-26T10:00:00Z', total_slots: 30 },
];
const notice = (id: string, text: string) => ({ concern_id: id, concern_type: 'OTHER', status: 'RESOLVED', accused_notified_at: null, created_at: '2026-10-19', resolution_summary: text });

describe('event approval and confidential notice read states', () => {
  beforeEach(() => {
    mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}) };
    mocks.success.mockReset(); mocks.error.mockReset();
  });
  afterEach(cleanup);

  it('shows an event load failure with Retry instead of claiming no proposals', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(events);
    render(<EventApprovalsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.queryByText('No pending event proposals for your clubs.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('First proposal')).toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('clears a rejection reason when changing proposals or cancelling', async () => {
    mocks.api.get.mockResolvedValue(events);
    render(<EventApprovalsPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject', exact: true }))[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Rejection reason' }), { target: { value: 'First reason' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject', exact: true })[1]);
    expect(screen.getByRole('textbox', { name: 'Rejection reason' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Confirm reject' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('locks all decisions during one submission and keeps a successful decision removed after refresh failure', async () => {
    const save = deferred<unknown>();
    mocks.api.get.mockResolvedValueOnce(events).mockRejectedValue(new Error('Refresh unavailable'));
    mocks.api.post.mockReturnValue(save.promise);
    render(<EventApprovalsPage />);
    const approve = (await screen.findAllByRole('button', { name: 'Approve', exact: true }))[0];
    act(() => { fireEvent.click(approve); fireEvent.click(approve); });
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByRole('button', { name: /^(Approve|Reject)$/ })) expect(button).toBeDisabled();
    await act(async () => { save.resolve({}); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.queryByText('First proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Second proposal')).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledWith('Approved — sent to HOD for review');
    expect(mocks.error).not.toHaveBeenCalled();
    mocks.api.get.mockResolvedValue(events);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Second proposal');
    expect(screen.queryByText('First proposal')).not.toBeInTheDocument();
  });

  it('retains the reason after a failed rejection and sends trimmed text', async () => {
    mocks.api.get.mockResolvedValue(events);
    mocks.api.post.mockRejectedValueOnce(new Error('Decision unavailable'));
    render(<EventApprovalsPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject', exact: true }))[0]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Need a venue  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Decision unavailable'));
    expect(screen.getByRole('textbox')).toHaveValue('  Need a venue  ');
    expect(mocks.api.post).toHaveBeenCalledWith('/api/campus-events/approvals/event-one/reject', { comment: 'Need a venue' });
  });

  it('ignores a previous account’s late event read', async () => {
    const old = deferred<unknown[]>();
    mocks.api.get.mockReturnValue(old.promise);
    const { rerender } = render(<EventApprovalsPage />);
    mocks.api = { get: vi.fn().mockResolvedValue([events[1]]), post: vi.fn() };
    rerender(<EventApprovalsPage />);
    await screen.findByText('Second proposal');
    await act(async () => { old.resolve([events[0]]); });
    expect(screen.queryByText('First proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Second proposal')).toBeInTheDocument();
  });

  it('does not let a completed old-account decision alter the new account', async () => {
    const save = deferred<unknown>();
    const oldApi = mocks.api;
    oldApi.get.mockResolvedValue(events); oldApi.post.mockReturnValue(save.promise);
    const { rerender } = render(<EventApprovalsPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Approve', exact: true }))[0]);
    mocks.api = { get: vi.fn().mockResolvedValue([events[0]]), post: vi.fn() };
    rerender(<EventApprovalsPage />);
    await screen.findByText('First proposal');
    await act(async () => { save.resolve({}); });
    expect(screen.getByText('First proposal')).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(oldApi.get).toHaveBeenCalledTimes(1);
  });

  it('offers Retry on a notice failure without an empty-state claim', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Notices unavailable')).mockResolvedValue([]);
    render(<SafetyNoticesPanel />);
    await screen.findByText('Could not load notices');
    expect(screen.queryByText('No safety notices for you')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No safety notices for you')).toBeInTheDocument();
  });

  it('never displays a confidential notice returned for a previous account', async () => {
    const old = deferred<unknown[]>();
    mocks.api.get.mockReturnValue(old.promise);
    const { rerender } = render(<SafetyNoticesPanel />);
    mocks.api = { get: vi.fn().mockResolvedValue([notice('new', 'New account resolution')]), post: vi.fn() };
    rerender(<SafetyNoticesPanel />);
    await screen.findByText(/New account resolution/);
    await act(async () => { old.resolve([notice('old', 'Old account resolution')]); });
    expect(screen.queryByText(/Old account resolution/)).not.toBeInTheDocument();
    expect(screen.getByText(/New account resolution/)).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UniversalDofaInboxPanel } from '../UniversalDofaInboxPanel';

const fixture = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { user_id: 'faculty-1', role: 'Faculty' },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixture.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/dofa-portal-routes', () => ({ getP2pDofaApprovalsPath: () => '/finance/approvals' }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false, withFacultyDemoFallback: (live: unknown) => live,
}));
vi.mock('@/lib/mock/faculty-portal-demo', () => ({
  facultyDemoDofaInbox: () => ({ cases: [], p2p_projections: [] }),
}));

const first = { case_id: 'case-1', title: 'First case', domain: 'GRADES', awaiting_role: 'Faculty' };
const second = { case_id: 'case-2', title: 'Second case', domain: 'GRADES', awaiting_role: 'Faculty' };
const inbox = (cases: typeof first[]) => ({ cases, p2p_projections: [] });
const caseRow = (title: string) => within(screen.getByText(title).closest('article')!);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.api = { get: vi.fn().mockResolvedValue(inbox([first, second])), post: vi.fn() };
});
afterEach(cleanup);

describe('DOFA decision ordering and authentication scope', () => {
  it('allows only one decision while any case is in flight and leaves other pending cases intact', async () => {
    const save = deferred<{ status: string }>();
    fixture.api.post.mockReturnValue(save.promise);
    render(<UniversalDofaInboxPanel />);
    await screen.findByText('First case');
    const approve = caseRow('First case').getByRole('button', { name: 'Approve' });
    fireEvent.click(approve); fireEvent.click(approve);
    fireEvent.click(caseRow('Second case').getByRole('button', { name: 'Approve' }));
    expect(fixture.api.post).toHaveBeenCalledExactlyOnceWith('/api/dofa/cases/case-1/decide', { decision: 'APPROVED' });
    expect(caseRow('Second case').getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(caseRow('Second case').getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByText('First case')).toBeInTheDocument();
    fixture.api.get.mockResolvedValue(inbox([second]));
    save.resolve({ status: 'APPROVED' });
    await waitFor(() => expect(screen.queryByText('First case')).not.toBeInTheDocument());
    expect(screen.getByText('Second case')).toBeInTheDocument();
  });

  it('retains both cases when a decision fails instead of restoring a stale whole-inbox snapshot', async () => {
    fixture.api.post.mockRejectedValue(new Error('Decision unavailable'));
    render(<UniversalDofaInboxPanel />);
    await screen.findByText('First case');
    fireEvent.click(caseRow('First case').getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Decision unavailable'));
    expect(caseRow('First case').getByRole('button', { name: 'Reject' })).toBeEnabled();
    expect(caseRow('Second case').getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('keeps a confirmed decision successful while a failed refresh is shown separately with retry', async () => {
    fixture.api.post.mockResolvedValue({ status: 'APPROVED' });
    render(<UniversalDofaInboxPanel />);
    await screen.findByText('First case');
    fixture.api.get.mockRejectedValue(new Error('Inbox refresh unavailable'));
    fireEvent.click(caseRow('First case').getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inbox refresh unavailable');
    expect(fixture.success).toHaveBeenCalledWith('Fully approved — case complete');
    expect(fixture.error).not.toHaveBeenCalled();
    expect(screen.queryByText('First case')).not.toBeInTheDocument();
    expect(caseRow('Second case').getByRole('button', { name: 'Approve' })).toBeDisabled();
    fixture.api.get.mockResolvedValue(inbox([second]));
    fireEvent.click(screen.getByRole('button', { name: 'Retry DOFA inbox' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(caseRow('Second case').getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('ignores an old account read that resolves after the current account inbox', async () => {
    const old = deferred<ReturnType<typeof inbox>>();
    fixture.api.get.mockReturnValue(old.promise);
    const view = render(<UniversalDofaInboxPanel />);
    fixture.api = { get: vi.fn().mockResolvedValue(inbox([{ ...second, title: 'New account case' }])), post: vi.fn() };
    view.rerender(<UniversalDofaInboxPanel />);
    await screen.findByText('New account case');
    old.resolve(inbox([first]));
    await waitFor(() => expect(screen.queryByText('First case')).not.toBeInTheDocument());
    expect(screen.getByText('New account case')).toBeInTheDocument();
  });

  it('ignores an old account decision completion without changing the new inbox or issuing a success toast', async () => {
    const save = deferred<{ status: string }>();
    const oldApi = fixture.api;
    oldApi.post.mockReturnValue(save.promise);
    const view = render(<UniversalDofaInboxPanel />);
    await screen.findByText('First case');
    fireEvent.click(caseRow('First case').getByRole('button', { name: 'Approve' }));
    fixture.api = { get: vi.fn().mockResolvedValue(inbox([{ ...first, title: 'New account case' }])), post: vi.fn() };
    view.rerender(<UniversalDofaInboxPanel />);
    await screen.findByText('New account case');
    save.resolve({ status: 'APPROVED' });
    await waitFor(() => expect(oldApi.get).toHaveBeenCalledTimes(1));
    expect(screen.getByText('New account case')).toBeInTheDocument();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.api.post).not.toHaveBeenCalled();
  });

  it('shows initial inbox failures explicitly rather than reporting no pending requests', async () => {
    fixture.api.get.mockRejectedValue(new Error('Inbox unavailable'));
    render(<UniversalDofaInboxPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Inbox unavailable');
    expect(screen.queryByText('No DOFA cases awaiting you.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry DOFA inbox' })).toBeEnabled();
  });
});

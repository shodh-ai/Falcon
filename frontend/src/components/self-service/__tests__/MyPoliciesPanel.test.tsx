import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyPoliciesPanel } from '../MyPoliciesPanel';

const fixture = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() }, success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixture.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/components/faculty', () => ({
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyEmptyState: ({ title, description }: { title: string; description: string }) => <div><h2>{title}</h2><p>{description}</p></div>,
}));

const first = { policy_id: 'policy-1', title: 'Policy One', category: 'HR', file_url: null, is_mandatory: true, acknowledged: false, user_vote: 'NO' };
const second = { ...first, policy_id: 'policy-2', title: 'Policy Two', user_vote: null };
const row = (title: string) => within(screen.getByRole('group', { name: title }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.api = { get: vi.fn().mockResolvedValue([first, second]), post: vi.fn() };
});
afterEach(cleanup);

describe('policy acknowledgements and votes', () => {
  it('serializes acknowledgements and votes across policies while a save is pending', async () => {
    const save = deferred<unknown>();
    fixture.api.post.mockReturnValue(save.promise);
    render(<MyPoliciesPanel />);
    await screen.findByRole('group', { name: 'Policy One' });
    const acknowledge = row('Policy One').getByRole('button', { name: 'Acknowledge' });
    fireEvent.click(acknowledge); fireEvent.click(acknowledge);
    fireEvent.click(row('Policy Two').getByRole('button', { name: 'In favour' }));
    expect(fixture.api.post).toHaveBeenCalledExactlyOnceWith('/api/hr/ess/policies/policy-1/acknowledge', {});
    expect(row('Policy Two').getByRole('button', { name: 'Against' })).toBeDisabled();
    expect(row('Policy Two').getByRole('button', { name: 'Acknowledge' })).toBeDisabled();
    fixture.api.get.mockResolvedValue([{ ...first, acknowledged: true }, second]);
    save.resolve({});
    expect(await screen.findByText('Acknowledged')).toBeInTheDocument();
    await waitFor(() => expect(row('Policy Two').getByRole('button', { name: 'In favour' })).toBeEnabled());
  });

  it.each(['acknowledge', 'vote'])(
    'preserves policy state and enables retry after a failed %s action', async action => {
      fixture.api.post.mockRejectedValue(new Error('Save unavailable'));
      render(<MyPoliciesPanel />);
      await screen.findByRole('group', { name: 'Policy One' });
      fireEvent.click(row('Policy One').getByRole('button', { name: action === 'vote' ? 'In favour' : 'Acknowledge' }));
      await waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Save unavailable'));
      expect(row('Policy One').getByRole('button', { name: 'Acknowledge' })).toBeEnabled();
      expect(row('Policy One').getByRole('button', { name: 'Against' })).toHaveAttribute('aria-pressed', 'true');
      expect(row('Policy Two').getByRole('button', { name: 'Acknowledge' })).toBeEnabled();
      expect(fixture.api.get).toHaveBeenCalledTimes(1);
      expect(fixture.success).not.toHaveBeenCalled();
    },
  );

  it('retains a confirmed vote and sibling policies when refreshing fails, then retries the read', async () => {
    fixture.api.post.mockResolvedValue({});
    render(<MyPoliciesPanel />);
    await screen.findByRole('group', { name: 'Policy One' });
    fixture.api.get.mockRejectedValue(new Error('Refresh unavailable'));
    fireEvent.click(row('Policy One').getByRole('button', { name: 'In favour' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(fixture.success).toHaveBeenCalledWith('Vote submitted');
    expect(fixture.error).not.toHaveBeenCalled();
    expect(row('Policy One').getByRole('button', { name: 'In favour' })).toHaveAttribute('aria-pressed', 'true');
    expect(row('Policy Two').getByRole('button', { name: 'Acknowledge' })).toBeDisabled();
    expect(screen.queryByText('No active policies')).not.toBeInTheDocument();
    fixture.api.get.mockResolvedValue([{ ...first, user_vote: 'YES' }, second]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(row('Policy Two').getByRole('button', { name: 'Acknowledge' })).toBeEnabled();
  });

  it('ignores a late policy read from a previous account', async () => {
    const oldRead = deferred<unknown[]>();
    fixture.api.get.mockReturnValue(oldRead.promise);
    const view = render(<MyPoliciesPanel />);
    fixture.api = { get: vi.fn().mockResolvedValue([{ ...second, title: 'New account policy' }]), post: vi.fn() };
    view.rerender(<MyPoliciesPanel />);
    await screen.findByRole('group', { name: 'New account policy' });
    oldRead.resolve([first]);
    await waitFor(() => expect(screen.queryByText('Policy One')).not.toBeInTheDocument());
    expect(screen.getByRole('group', { name: 'New account policy' })).toBeInTheDocument();
  });

  it('ignores an old acknowledgement completion after switching accounts', async () => {
    const save = deferred<unknown>();
    const oldApi = fixture.api;
    oldApi.post.mockReturnValue(save.promise);
    const view = render(<MyPoliciesPanel />);
    await screen.findByRole('group', { name: 'Policy One' });
    fireEvent.click(row('Policy One').getByRole('button', { name: 'Acknowledge' }));
    fixture.api = { get: vi.fn().mockResolvedValue([{ ...second, title: 'New account policy' }]), post: vi.fn() };
    view.rerender(<MyPoliciesPanel />);
    await screen.findByRole('group', { name: 'New account policy' });
    save.resolve({});
    await waitFor(() => expect(oldApi.get).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('group', { name: 'New account policy' })).toBeInTheDocument();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.api.post).not.toHaveBeenCalled();
  });

  it('does not treat a malformed policy response as a legitimate empty list', async () => {
    fixture.api.get.mockResolvedValue({});
    render(<MyPoliciesPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read policies');
    expect(screen.queryByText('No active policies')).not.toBeInTheDocument();
    expect(fixture.api.post).not.toHaveBeenCalled();
  });
});

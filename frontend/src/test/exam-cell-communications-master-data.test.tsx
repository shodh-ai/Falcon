import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import NotificationsPage from '@/app/(portals)/exam-cell/notifications/page';
import CentresPage from '@/app/(portals)/exam-cell/exam-centres/page';

const { api, auth, toast } = vi.hoisted(() => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, auth: { api }, toast: { error: vi.fn(), success: vi.fn() } };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const room = { space_id: 'synthetic-room', building_name: 'Synthetic building', room_number: 'S-01', capacity: 45, status: 'AVAILABLE', facilities: ['projector'] };

beforeEach(() => { auth.api = api; api.get.mockReset(); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset(); });

describe('Examination Cell communication loading and actions', () => {
  it('distinguishes failed campaign history from a genuine empty history and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic campaigns unavailable')).mockResolvedValueOnce([]);
    render(<NotificationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic campaigns unavailable');
    expect(screen.queryByText('No notification campaigns sent yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry campaign history' }));
    expect(await screen.findByText('No notification campaigns sent yet.')).toBeTruthy();
  });

  it('offers only implemented in-app delivery and explains missing provider implementations', async () => {
    api.get.mockResolvedValue([]);
    render(<NotificationsPage />);
    await screen.findByText('No notification campaigns sent yet.');
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['IN_APP']);
    expect(screen.getByText(/Adding credentials alone does not enable these channels/)).toBeTruthy();
  });

  it('does not claim external or malformed delivery responses succeeded', async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ delivered: 1, channel: 'EMAIL', message: 'Fake external delivery' });
    render(<NotificationsPage />);
    await screen.findByText('No notification campaigns sent yet.');
    fireEvent.change(screen.getByLabelText('Notification subject'), { target: { value: 'Synthetic alert' } });
    fireEvent.change(screen.getByLabelText('Notification message'), { target: { value: 'Synthetic message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to all students' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The server did not confirm in-app notification delivery'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Notification subject')).toHaveValue('Synthetic alert');
  });

  it('shows zero delivery accurately and preserves the message for a later retry', async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ delivered: 0, channel: 'IN_APP', message: 'No active students; nothing was delivered.' });
    render(<NotificationsPage />);
    await screen.findByText('No notification campaigns sent yet.');
    fireEvent.change(screen.getByLabelText('Notification subject'), { target: { value: 'Synthetic alert' } });
    fireEvent.change(screen.getByLabelText('Notification message'), { target: { value: 'Synthetic message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to all students' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No active students; nothing was delivered.'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Notification message')).toHaveValue('Synthetic message');
  });

  it('labels historical external campaigns without asserting external delivery', async () => {
    api.get.mockResolvedValue([{ campaign_id: 'old-external', channel: 'EMAIL', subject: 'Historical external campaign', recipient_count: 1, sent_at: '2026-10-20T12:00:00Z' }]);
    render(<NotificationsPage />);
    expect(await screen.findByText('External delivery unverified')).toBeTruthy();
  });

  it('sends one in-app campaign for repeated clicks and retains input on failure', async () => {
    const send = deferred<object>();
    api.get.mockResolvedValue([]);
    api.post.mockReturnValueOnce(send.promise).mockResolvedValueOnce({ delivered: 1, channel: 'IN_APP', message: 'Synthetic local campaign saved' });
    render(<NotificationsPage />);
    await screen.findByText('No notification campaigns sent yet.');
    fireEvent.change(screen.getByPlaceholderText('Subject (e.g. Hall tickets released)'), { target: { value: 'Synthetic alert' } });
    fireEvent.change(screen.getByPlaceholderText('Message body…'), { target: { value: 'Synthetic local message' } });
    const submit = screen.getByRole('button', { name: 'Send to all students' });
    await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/notifications/send', { channel: 'IN_APP', subject: 'Synthetic alert', body: 'Synthetic local message' });
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => send.reject(new Error('Synthetic send failure')));
    expect(screen.getByPlaceholderText('Message body…')).toHaveValue('Synthetic local message');
    fireEvent.click(screen.getByRole('button', { name: 'Send to all students' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.success).toHaveBeenCalledExactlyOnceWith('Synthetic local campaign saved'));
  });

  it('ignores obsolete campaign history after a successful send has refreshed it', async () => {
    const old = deferred<object[]>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ campaign_id: 'new', channel: 'IN_APP', subject: 'Current synthetic alert', body: 'Synthetic message', recipient_count: 1, sent_by_name: 'Synthetic staff', sent_at: '2026-10-21T09:00:00Z' }]);
    api.post.mockResolvedValue({ delivered: 1, channel: 'IN_APP', message: 'Synthetic local campaign saved' });
    render(<NotificationsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Subject (e.g. Hall tickets released)'), { target: { value: 'Current synthetic alert' } });
    fireEvent.change(screen.getByPlaceholderText('Message body…'), { target: { value: 'Synthetic message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to all students' }));
    await screen.findByText('Current synthetic alert');
    await act(async () => old.resolve([]));
    expect(screen.getByText('Current synthetic alert')).toBeTruthy();
    expect(screen.queryByText('No notification campaigns sent yet.')).toBeNull();
  });
});

describe('Examination Cell room master-data loading', () => {
  it('shows an API failure instead of empty filters and zero-room metrics, and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic rooms unavailable')).mockResolvedValueOnce([room]);
    render(<CentresPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic rooms unavailable');
    expect(screen.queryByText('Total rooms')).toBeNull();
    expect(screen.queryByText('No rooms match your filters. Try clearing search or choosing All buildings.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry rooms' }));
    expect(await screen.findByText('S-01')).toBeTruthy();
    expect(screen.getByText('Total rooms')).toBeTruthy();
  });

  it('clears old room rows during a failed refresh and preserves working local filters', async () => {
    const refresh = deferred<object[]>();
    api.get.mockResolvedValueOnce([room]).mockReturnValueOnce(refresh.promise);
    render(<CentresPage />);
    await screen.findByText('S-01');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'projector' } });
    expect(screen.getByText('S-01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.queryByText('S-01')).toBeNull();
    await act(async () => refresh.reject(new Error('Synthetic refresh unavailable')));
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic refresh unavailable');
    expect(screen.queryByText('S-01')).toBeNull();
    expect(screen.queryByText('Total rooms')).toBeNull();
  });

  it('does not display a previous authenticated session room list while the new request is pending', async () => {
    api.get.mockResolvedValue([room]);
    const { rerender } = render(<CentresPage />);
    await screen.findByText('S-01');
    const pending = deferred<object[]>();
    auth.api = { get: vi.fn().mockReturnValue(pending.promise), post: vi.fn() };
    rerender(<CentresPage />);
    expect(screen.queryByText('S-01')).toBeNull();
    expect(screen.queryByText('Total rooms')).toBeNull();
    await act(async () => pending.resolve([]));
    expect(screen.getByText('No rooms match your filters. Try clearing search or choosing All buildings.')).toBeTruthy();
  });
});

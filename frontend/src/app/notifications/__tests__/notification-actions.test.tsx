import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from '../page';

const mocks = vi.hoisted(() => ({
  token: 'account-one', refresh: vi.fn(), markAllRead: vi.fn(), markRead: vi.fn(), dismiss: vi.fn(),
  success: vi.fn(), error: vi.fn(), historyError: null as Error | null,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: mocks.token, isAuthenticated: true, isLoading: false, user: { role: 'Faculty' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('next/link', () => ({ default: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock('@/hooks/useNotifications', () => ({
  useNotificationHistory: () => ({ notifications: [{ notification_id: 'live-one', unread: true }], isLoading: false, error: mocks.historyError, refresh: mocks.refresh }),
  toAppNotification: () => ({ id: 'live-one', title: 'Test update', unread: true, intent: 'informational', category: 'ACADEMICS' }),
  filterNotifications: (items: unknown[]) => items,
}));
vi.mock('@/lib/api/notifications', () => ({ notificationsApi: { markAllRead: mocks.markAllRead, markRead: mocks.markRead, dismiss: mocks.dismiss } }));
vi.mock('@/lib/notifications/notification-actions', () => ({ handleNotificationAction: vi.fn().mockResolvedValue('navigate') }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/notifications/NotificationItem', () => ({
  NOTIFICATION_CATEGORY_FILTERS: [], NotificationEmptyState: () => <p>No updates</p>,
  NotificationItem: ({ onClick, onDismiss }: { onClick?: () => void; onDismiss?: () => void }) => <div><button onClick={onClick}>Open test update</button><button onClick={onDismiss}>Dismiss test update</button></div>,
}));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('notification action failures and retries', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.token = 'account-one'; mocks.historyError = null;
    mocks.refresh.mockResolvedValue([]); mocks.markAllRead.mockResolvedValue({});
    mocks.dismiss.mockResolvedValue({}); mocks.markRead.mockResolvedValue({});
  });
  afterEach(cleanup);

  it('reports mark-all failure and permits a retry without an unhandled rejection', async () => {
    mocks.markAllRead.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Network unavailable'));
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.markAllRead).toHaveBeenCalledTimes(2);
  });

  it('blocks duplicate mark-all submissions while the first request is pending', async () => {
    const save = deferred(); mocks.markAllRead.mockReturnValue(save.promise);
    render(<NotificationsPage />);
    const button = screen.getByRole('button', { name: 'Mark all read' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => { save.resolve({}); });
    expect(button).toBeEnabled();
  });

  it('separates successful marking from a failed list refresh and retries only the read', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('Refresh unavailable')).mockResolvedValue([]);
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Marked as read. Could not refresh');
    expect(mocks.success).toHaveBeenCalledWith('All notifications marked as read');
    expect(mocks.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores completion from the previous account and does not refresh its cache', async () => {
    const save = deferred(); mocks.markAllRead.mockReturnValue(save.promise);
    const { rerender } = render(<NotificationsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    mocks.token = 'account-two'; rerender(<NotificationsPage />);
    await act(async () => { save.resolve({}); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled();
  });

  it('provides an inline retry when notification history cannot load', async () => {
    mocks.historyError = new Error('History unavailable');
    render(<NotificationsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load notifications');
    expect(screen.queryByText('No updates')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });

  it('handles a successful dismissal followed by a failed refresh', async () => {
    mocks.refresh.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Refresh unavailable'));
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss test update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notification removed. Could not refresh');
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

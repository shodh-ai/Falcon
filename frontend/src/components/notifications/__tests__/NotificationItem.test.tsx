import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  NotificationEmptyState,
  NotificationItem,
} from '@/components/notifications/NotificationItem';

const baseNotification = {
  id: 'n1',
  title: 'Leave approval pending',
  body: 'Review faculty leave request',
  category: 'HR',
  severity: 'warning' as const,
  intent: 'action_required' as const,
  actionLabel: 'Review',
  actionLink: '/hr/leave/1',
  unread: true,
  createdAt: new Date().toISOString(),
};

describe('NotificationItem', () => {
  it('renders unread styling and dismiss button', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationItem notification={baseNotification} onDismiss={onDismiss} />,
    );
    expect(screen.getByText('Leave approval pending')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove notification'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('invokes onClick when row clicked', () => {
    const onClick = vi.fn();
    render(<NotificationItem notification={baseNotification} onClick={onClick} />);
    fireEvent.click(screen.getByText('Leave approval pending'));
    expect(onClick).toHaveBeenCalled();
  });

  it('supports keyboard activation and compact layout', () => {
    const onClick = vi.fn();
    render(
      <NotificationItem notification={baseNotification} compact onClick={onClick} />,
    );
    fireEvent.keyDown(screen.getByText('Leave approval pending'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('renders read state without dismiss control', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, unread: false, createdAt: undefined }}
      />,
    );
    expect(screen.queryByLabelText('Remove notification')).toBeNull();
  });
});

describe('NotificationEmptyState', () => {
  it('renders compact and default variants', () => {
    const { rerender } = render(<NotificationEmptyState compact />);
    expect(screen.getByText(/all caught up/i)).toBeTruthy();
    rerender(<NotificationEmptyState />);
    expect(screen.getByText(/New alerts and pending actions/i)).toBeTruthy();
  });
});

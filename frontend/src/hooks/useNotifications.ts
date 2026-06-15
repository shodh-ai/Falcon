'use client';

import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi, type FalconNotification } from '@/lib/api/notifications';

const POLL_MS = 15_000;

export function useNotificationUnreadCount() {
  const { token, isAuthenticated } = useAuth();
  const { data, mutate } = useSWR(
    isAuthenticated && token ? ['notifications-unread', token] : null,
    () => notificationsApi.unreadCount(token!),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  return { count: data?.count ?? 0, refresh: mutate };
}

export function useRecentNotifications() {
  const { token, isAuthenticated } = useAuth();
  const { data, mutate, isLoading } = useSWR(
    isAuthenticated && token ? ['notifications-recent', token] : null,
    () => notificationsApi.recent(token!),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  return {
    notifications: data ?? [],
    isLoading,
    refresh: mutate,
  };
}

export function useNotificationHistory() {
  const { token, isAuthenticated } = useAuth();
  const { data, mutate, isLoading } = useSWR(
    isAuthenticated && token ? ['notifications-all', token] : null,
    () => notificationsApi.list(token!, 100),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  return {
    notifications: data ?? [],
    isLoading,
    refresh: mutate,
  };
}

export function categoryToUiType(
  category: string,
): 'fee' | 'warning' | 'success' | 'info' {
  switch (category) {
    case 'FINANCE':
      return 'fee';
    case 'ACADEMICS':
    case 'EXAMS':
      return 'warning';
    case 'HR':
    case 'PLACEMENT':
      return 'success';
    default:
      return 'info';
  }
}

export function toAppNotification(n: FalconNotification) {
  return {
    id: n.notification_id,
    title: n.title,
    body: n.message,
    type: categoryToUiType(n.category),
    unread: !n.is_read,
    actionLink: n.action_link,
    createdAt: n.created_at,
  };
}

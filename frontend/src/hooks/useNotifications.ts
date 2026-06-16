'use client';

import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi, type FalconNotification } from '@/lib/api/notifications';
import {
  defaultActionLabel,
  inferIntentFromTitle,
  inferSeverityFromCategory,
  resolveIntent,
  resolveSeverity,
  type NotificationIntent,
  type NotificationSeverity,
} from '@/lib/notifications/notification-display';

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
  const { data, mutate, isLoading, error } = useSWR(
    isAuthenticated && token ? ['notifications-recent', token] : null,
    () => notificationsApi.recent(token!),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  return {
    notifications: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useNotificationHistory() {
  const { token, isAuthenticated } = useAuth();
  const { data, mutate, isLoading, error } = useSWR(
    isAuthenticated && token ? ['notifications-all', token] : null,
    () => notificationsApi.list(token!, 100),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  return {
    notifications: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  category: string;
  severity: NotificationSeverity;
  intent: NotificationIntent;
  actionLabel: string;
  unread: boolean;
  actionLink?: string | null;
  createdAt?: string;
};

export function toAppNotification(n: FalconNotification): AppNotification {
  const severity = n.severity
    ? resolveSeverity(n.severity)
    : inferSeverityFromCategory(n.category);
  const intent = n.intent ? resolveIntent(n.intent) : inferIntentFromTitle(n.title);
  return {
    id: n.notification_id,
    title: n.title,
    body: n.message,
    category: n.category,
    severity,
    intent,
    actionLabel: defaultActionLabel(intent, n.action_label),
    unread: !n.is_read,
    actionLink: n.action_link,
    createdAt: n.created_at,
  };
}

/** @deprecated Use severity/intent from toAppNotification */
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

export function filterNotifications(
  items: AppNotification[],
  filter: 'all' | 'unread' | 'action_required',
  category?: string,
): AppNotification[] {
  return items.filter((n) => {
    if (filter === 'unread' && !n.unread) return false;
    if (filter === 'action_required' && n.intent !== 'action_required') return false;
    if (category && category !== 'ALL' && n.category !== category) return false;
    return true;
  });
}

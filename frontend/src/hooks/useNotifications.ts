'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi, type FalconNotification } from '@/lib/api/notifications';
import {
  DEMO_DASHBOARD_METRICS,
  demoNotificationsAsFalcon,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { isFacultyDemoModeEnabled } from '@/lib/faculty-demo-mode';
import { facultyDemoNotifications } from '@/lib/mock/faculty-portal-demo';
import {
  defaultActionLabel,
  inferIntentFromTitle,
  inferSeverityFromCategory,
  resolveIntent,
  resolveSeverity,
  type NotificationIntent,
  type NotificationSeverity,
} from '@/lib/notifications/notification-display';
import {
  getNotificationPollInterval,
  useNotificationSocketConnected,
} from '@/hooks/useNotificationRealtime';

function isStudentRole(user: { role?: string | null; primaryRole?: string | null } | null | undefined) {
  const role = user?.role?.trim().toLowerCase() || user?.primaryRole?.trim().toLowerCase();
  return role === 'student' || role === 'applicant';
}

function isFacultyRole(user: { role?: string | null; primaryRole?: string | null } | null | undefined) {
  const role = user?.role?.trim().toLowerCase() || user?.primaryRole?.trim().toLowerCase();
  return role === 'faculty' || role === 'teacher' || role === 'professor';
}

function withStudentDemoNotifications(
  data: FalconNotification[] | undefined,
  user: { user_id?: string; role?: string | null; primaryRole?: string | null } | null | undefined,
) {
  if (!data) return [];
  const filtered = isStudentRole(user) ? data.filter((n) => n.category !== 'HR') : data;
  if (isStudentRole(user) && filtered.length === 0 && isStudentDemoModeEnabled()) {
    return demoNotificationsAsFalcon(user?.user_id ?? 'demo-student');
  }
  if (isFacultyRole(user) && filtered.length === 0 && isFacultyDemoModeEnabled()) {
    return facultyDemoNotifications(user?.user_id ?? 'demo-faculty');
  }
  return filtered;
}

export function useNotificationUnreadCount() {
  const { token, isAuthenticated, user } = useAuth();
  const socketConnected = useNotificationSocketConnected();
  const { data, mutate } = useSWR(
    isAuthenticated && token
      ? ['notifications-unread', token, socketConnected ? 'rt' : 'poll']
      : null,
    () => notificationsApi.unreadCount(token!),
    { refreshInterval: getNotificationPollInterval(), revalidateOnFocus: true },
  );
  const count = data?.count ?? 0;
  const demoCount =
    isStudentRole(user) && count === 0 && isStudentDemoModeEnabled()
      ? DEMO_DASHBOARD_METRICS.unread_notifications
      : isFacultyRole(user) && count === 0 && isFacultyDemoModeEnabled()
        ? facultyDemoNotifications(user?.user_id).filter((n) => !n.is_read).length
        : count;
  return { count: demoCount, refresh: mutate };
}

export function useRecentNotifications() {
  const { token, isAuthenticated, user } = useAuth();
  const socketConnected = useNotificationSocketConnected();
  const { data, mutate, isLoading, error } = useSWR(
    isAuthenticated && token
      ? ['notifications-recent', token, socketConnected ? 'rt' : 'poll']
      : null,
    () => notificationsApi.recent(token!),
    { refreshInterval: getNotificationPollInterval(), revalidateOnFocus: true },
  );

  const filteredNotifications = useMemo(
    () => withStudentDemoNotifications(data, user).slice(0, 8),
    [data, user],
  );

  return {
    notifications: filteredNotifications,
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useNotificationHistory() {
  const { token, isAuthenticated, user } = useAuth();
  const socketConnected = useNotificationSocketConnected();
  const { data, mutate, isLoading, error } = useSWR(
    isAuthenticated && token
      ? ['notifications-all', token, socketConnected ? 'rt' : 'poll']
      : null,
    () => notificationsApi.list(token!, 100),
    { refreshInterval: getNotificationPollInterval(), revalidateOnFocus: true },
  );

  const filteredNotifications = useMemo(
    () => withStudentDemoNotifications(data, user),
    [data, user],
  );

  return {
    notifications: filteredNotifications,
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

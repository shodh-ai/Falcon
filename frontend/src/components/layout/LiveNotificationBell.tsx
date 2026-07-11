'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/layout/NotificationBell';
import {
  useNotificationUnreadCount,
  useNotificationHistory,
  toAppNotification,
} from '@/hooks/useNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';

export function LiveNotificationBell() {
  const router = useRouter();
  const { token } = useAuth();
  const { refresh: refreshCount } = useNotificationUnreadCount();
  const { notifications, isLoading, refresh: refreshList } = useNotificationHistory();

  const items = useMemo(
    () => notifications.map(toAppNotification),
    [notifications],
  );
  const previewItems = useMemo(() => items.slice(0, 20), [items]);
  // Badge must match visible (role-filtered) rows — not the raw API unread-count.
  const visibleUnread = useMemo(
    () => items.filter((n) => n.unread).length,
    [items],
  );

  useEffect(() => {
    const onRefresh = () => {
      void Promise.all([refreshCount(), refreshList()]);
    };
    window.addEventListener('falcon:notifications-refresh', onRefresh);
    return () => window.removeEventListener('falcon:notifications-refresh', onRefresh);
  }, [refreshCount, refreshList]);

  const handleSelect = async (n: ReturnType<typeof toAppNotification>) => {
    if (!token) return;
    try {
      const result = await handleNotificationAction(token, n.actionLink, router);
      if (result === 'download') {
        toast.success('Download started');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
      return;
    }
    if (n.unread) {
      await notificationsApi.markRead(token, n.id).catch(() => undefined);
      await Promise.all([refreshCount(), refreshList()]);
    }
  };

  const handleDismiss = async (n: ReturnType<typeof toAppNotification>) => {
    if (!token) return;

    await refreshList(
      (current) => current?.filter((row) => row.notification_id !== n.id) ?? [],
      { revalidate: false },
    );

    try {
      await notificationsApi.dismiss(token, n.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!/404|not found/i.test(msg)) {
        toast.error('Could not remove notification');
        await Promise.all([refreshCount(), refreshList()]);
        return;
      }
    }

    await Promise.all([refreshCount(), refreshList()]);
    window.dispatchEvent(new Event('falcon:notifications-refresh'));
  };

  return (
    <NotificationBell
      notifications={previewItems}
      unreadCount={visibleUnread}
      isLoading={isLoading}
      onSelect={handleSelect}
      onDismiss={handleDismiss}
      viewAllHref="/notifications"
    />
  );
}

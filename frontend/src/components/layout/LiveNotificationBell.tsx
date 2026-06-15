'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  NotificationBell,
  type AppNotification,
} from '@/components/layout/NotificationBell';
import {
  useNotificationUnreadCount,
  useRecentNotifications,
  toAppNotification,
} from '@/hooks/useNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';

export function LiveNotificationBell() {
  const router = useRouter();
  const { token } = useAuth();
  const { count, refresh: refreshCount } = useNotificationUnreadCount();
  const { notifications, refresh: refreshList } = useRecentNotifications();

  const items: AppNotification[] = notifications.map(toAppNotification);

  useEffect(() => {
    const onRefresh = () => {
      void Promise.all([refreshCount(), refreshList()]);
    };
    window.addEventListener('falcon:notifications-refresh', onRefresh);
    return () => window.removeEventListener('falcon:notifications-refresh', onRefresh);
  }, [refreshCount, refreshList]);

  const handleSelect = async (n: AppNotification) => {
    if (!token) return;
    try {
      await handleNotificationAction(token, n.actionLink, router);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
      return;
    }
    if (n.unread) {
      await notificationsApi.markRead(token, n.id).catch(() => undefined);
      await Promise.all([refreshCount(), refreshList()]);
    }
  };

  return (
    <NotificationBell
      notifications={items}
      unreadCount={count}
      onSelect={handleSelect}
      viewAllHref="/notifications"
    />
  );
}

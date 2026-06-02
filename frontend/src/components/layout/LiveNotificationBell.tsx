'use client';

import { useRouter } from 'next/navigation';
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

export function LiveNotificationBell() {
  const router = useRouter();
  const { token } = useAuth();
  const { count, refresh: refreshCount } = useNotificationUnreadCount();
  const { notifications, refresh: refreshList } = useRecentNotifications();

  const items: AppNotification[] = notifications.map(toAppNotification);

  const handleSelect = async (n: AppNotification) => {
    if (!token) return;
    if (n.unread) {
      await notificationsApi.markRead(token, n.id).catch(() => undefined);
      await Promise.all([refreshCount(), refreshList()]);
    }
    if (n.actionLink) {
      router.push(n.actionLink);
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

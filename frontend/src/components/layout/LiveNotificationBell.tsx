'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/layout/NotificationBell';
import {
  useNotificationUnreadCount,
  useNotificationHistory,
  toAppNotification,
} from '@/hooks/useNotifications';
import { useNotificationRealtime } from '@/hooks/useNotificationRealtime';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';
import { areInAppAlertsEnabled } from '@/lib/notifications/account-prefs';

export function LiveNotificationBell() {
  const router = useRouter();
  const { token } = useAuth();
  useNotificationRealtime();
  const { refresh: refreshCount } = useNotificationUnreadCount();
  const { notifications, isLoading, refresh: refreshList } = useNotificationHistory();
  const [inAppEnabled, setInAppEnabled] = useState(true);

  useEffect(() => {
    setInAppEnabled(areInAppAlertsEnabled());
    const onPrefs = () => setInAppEnabled(areInAppAlertsEnabled());
    window.addEventListener('falcon:account-prefs-changed', onPrefs);
    window.addEventListener('storage', onPrefs);
    return () => {
      window.removeEventListener('falcon:account-prefs-changed', onPrefs);
      window.removeEventListener('storage', onPrefs);
    };
  }, []);

  const items = useMemo(
    () => (inAppEnabled ? notifications.map(toAppNotification) : []),
    [notifications, inAppEnabled],
  );
  const previewItems = useMemo(() => items.slice(0, 20), [items]);
  // Badge must match visible (role-filtered) rows — not the raw API unread-count.
  const visibleUnread = useMemo(
    () => (inAppEnabled ? items.filter((n) => n.unread).length : 0),
    [items, inAppEnabled],
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
      isLoading={inAppEnabled && isLoading}
      onSelect={handleSelect}
      onDismiss={handleDismiss}
      viewAllHref="/notifications"
    />
  );
}

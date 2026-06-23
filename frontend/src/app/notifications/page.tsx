'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  filterNotifications,
  useNotificationHistory,
  toAppNotification,
} from '@/hooks/useNotifications';
import { toast } from '@/lib/notifications/falcon-toast';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';
import { notificationSummary } from '@/lib/notifications/notification-display';
import { NotificationFilterBar } from '@/components/notifications/NotificationFilterBar';
import {
  NotificationEmptyState,
  NotificationItem,
  NOTIFICATION_CATEGORY_FILTERS,
} from '@/components/notifications/NotificationItem';

type FilterTab = 'all' | 'unread' | 'action_required';

export default function NotificationsPage() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const { notifications, isLoading, error, refresh } = useNotificationHistory();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [category, setCategory] = useState('ALL');

  const items = useMemo(() => notifications.map(toAppNotification), [notifications]);
  const filtered = useMemo(
    () => filterNotifications(items, filter, category),
    [items, filter, category],
  );
  const unreadCount = items.filter((n) => n.unread).length;
  const actionCount = items.filter((n) => n.intent === 'action_required' && n.unread).length;
  const summary = notificationSummary(unreadCount, actionCount);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-muted-foreground">Sign in to view your notifications.</p>
        <Button asChild className="mt-4">
          <Link href="/">Go to login</Link>
        </Button>
      </div>
    );
  }

  const markAll = async () => {
    if (!token) return;
    await notificationsApi.markAllRead(token);
    await refresh();
    toast.success('All notifications marked as read');
  };

  const openNotification = async (
    id: string,
    actionLink: string | null | undefined,
    unread: boolean,
  ) => {
    if (!token) return;
    try {
      const result = await handleNotificationAction(token, actionLink, router);
      if (result === 'download') toast.success('Download started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
      return;
    }
    if (unread) {
      await notificationsApi.markRead(token, id).catch(() => undefined);
      await refresh();
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
          <Link href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to portal
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Bell className="h-6 w-6 text-sgvu-gold" />
              <h1 className="text-2xl font-black text-sgvu-navy">Notification Center</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Updates, approvals, and alerts from across Falcon — with clear next steps.
            </p>
            {summary && (
              <p className="mt-2 text-xs font-medium text-muted-foreground">{summary}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={markAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="mr-1 h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="mb-3 space-y-3">
        <NotificationFilterBar
          options={[
            { id: 'all' as const, label: 'All' },
            { id: 'unread' as const, label: 'Unread', count: unreadCount },
            { id: 'action_required' as const, label: 'Action required', count: actionCount },
          ]}
          active={filter}
          onChange={setFilter}
        />
        <NotificationFilterBar
          options={NOTIFICATION_CATEGORY_FILTERS.map((opt) => ({
            id: opt.value,
            label: opt.label,
          }))}
          active={category}
          onChange={setCategory}
          size="sm"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-sgvu-navy">
            {filter === 'action_required'
              ? 'Pending actions'
              : filter === 'unread'
                ? 'Unread alerts'
                : 'All notifications'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notifications…
            </div>
          )}
          {error && (
            <p className="py-6 text-center text-sm text-destructive">
              Could not load notifications. Please refresh the page.
            </p>
          )}
          {!isLoading && !error && filtered.length === 0 && <NotificationEmptyState />}
          {!isLoading &&
            !error &&
            filtered.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onClick={() => openNotification(n.id, n.actionLink, n.unread)}
              />
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

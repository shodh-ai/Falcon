'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useNotificationHistory,
  toAppNotification,
  categoryToUiType,
} from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';
import { cn } from '@/lib/utils';

const typeStyles = {
  fee: 'bg-amber-100 text-amber-800',
  warning: 'bg-red-100 text-red-800',
  success: 'bg-emerald-100 text-emerald-800',
  info: 'bg-blue-100 text-blue-800',
};

export default function NotificationsPage() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const { notifications, isLoading, refresh } = useNotificationHistory();

  if (authLoading) {
    return <p className="p-8 text-muted-foreground">Loading…</p>;
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
  };

  const openNotification = async (id: string, actionLink: string | null | undefined, unread: boolean) => {
    if (!token) return;
    try {
      await handleNotificationAction(token, actionLink, router);
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">Notifications</h1>
          <p className="text-sm text-muted-foreground">Alerts from Academics, Finance, HR, and more.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAll}>
          Mark all as read
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading notifications…</p>}
          {!isLoading && notifications.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          )}
          {notifications.map((raw) => {
            const n = toAppNotification(raw);
            const uiType = categoryToUiType(raw.category);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotification(n.id, n.actionLink, n.unread)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition hover:bg-muted/50',
                  n.unread && 'border-sgvu-gold/40 bg-sgvu-gold/5',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', typeStyles[uiType])}>
                    {raw.category}
                  </span>
                  {n.unread && <Badge variant="destructive">New</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="font-semibold text-foreground">{n.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

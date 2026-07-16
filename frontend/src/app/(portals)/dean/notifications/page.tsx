'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { useAuthedApi } from '@/lib/api';
import { buildDeanPageQuery, type PaginatedApiResponse } from '@/lib/dean-pagination';
import { cn } from '@/lib/utils';

type NotificationRow = {
  notification_id: string;
  title: string;
  message: string;
  priority: string | null;
  is_read: boolean;
  created_at: string;
  action_link: string | null;
};

export default function DeanNotificationsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildDeanPageQuery({ page: Math.floor(offset / limit) + 1, limit });
      const statusQs = filter === 'unread' ? '&status=unread' : '';
      const data = await api.get<PaginatedApiResponse<NotificationRow> & { unread_count: number }>(
        `/api/academics/dean/intelligence/notifications?${qs}${statusQs}`,
      );
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, filter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await api.patch(`/api/academics/dean/intelligence/notifications/${id}/read`, {});
    await load();
  }

  async function markAllRead() {
    await api.patch('/api/academics/dean/intelligence/notifications/read-all', {});
    await load();
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Notification Center"
        description="Funding requests, policy approvals, events, workload issues, and system announcements."
        workspaceLabel="Dean Workspace"
        meta={<span>{unreadCount} unread</span>}
        actions={
          unreadCount > 0 ? (
            <Button size="sm" variant="outline" onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="flex gap-2" role="tablist" aria-label="Notification filter">
        {(['all', 'unread'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            role="tab"
            aria-selected={filter === value}
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => {
              setOffset(0);
              setFilter(value);
            }}
          >
            {value === 'all' ? 'All' : 'Unread'}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <HodPanel title="Notifications">
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </HodPanel>
      ) : (
        <div className="space-y-3">
          {rows.map((item) => (
            <div
              key={item.notification_id}
              className={cn(
                'rounded-xl border bg-white p-4 shadow-sm',
                !item.is_read && 'border-l-4 border-l-sgvu-gold',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sgvu-navy">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString('en-IN')}
                    {item.priority ? ` · ${item.priority}` : ''}
                  </p>
                </div>
                {!item.is_read ? (
                  <Button size="sm" variant="outline" onClick={() => void markRead(item.notification_id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationBar total={total} limit={limit} offset={offset} onPageChange={setOffset} />
    </HodPageFrame>
  );
}

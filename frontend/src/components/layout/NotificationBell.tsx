'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NotificationEmptyState,
  NotificationItem,
} from '@/components/notifications/NotificationItem';
import type { AppNotification } from '@/hooks/useNotifications';
import { notificationSummary } from '@/lib/notifications/notification-display';
import { HEADER_ICON_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';

export type { AppNotification };

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount?: number;
  isLoading?: boolean;
  onSelect?: (notification: AppNotification) => void;
  onDismiss?: (notification: AppNotification) => void;
  viewAllHref?: string;
}

export function NotificationBell({
  notifications,
  unreadCount,
  isLoading = false,
  onSelect,
  onDismiss,
  viewAllHref = '/notifications',
}: NotificationBellProps) {
  const unread = unreadCount ?? notifications.filter((n) => n.unread).length;
  const actionRequired = notifications.filter((n) => n.intent === 'action_required' && n.unread);
  const summary = notificationSummary(unread, actionRequired.length);

  const [open, setOpen] = useState(false);

  const handleSelect = (n: AppNotification) => {
    setOpen(false);
    onSelect?.(n);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={cn('relative', HEADER_ICON_CONTROL_CLASS)}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(calc(100vw-1.5rem),24rem)] p-0"
      >
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold text-sgvu-navy">Notifications</p>
            {unread > 0 && (
              <span
                className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-white"
                aria-label={`${unread} unread`}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          {summary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
        </div>

        <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!isLoading && notifications.length === 0 && <NotificationEmptyState compact />}
          {!isLoading && notifications.length > 0 && (
            <div className="space-y-2">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  compact
                  onClick={() => handleSelect(n)}
                  onDismiss={onDismiss ? () => onDismiss(n) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="p-0">
          <Link
            href={viewAllHref}
            onClick={() => setOpen(false)}
            className="flex w-full justify-center px-4 py-3 text-center text-sm font-semibold text-sgvu-navy hover:bg-muted/50"
          >
            Open notification center
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

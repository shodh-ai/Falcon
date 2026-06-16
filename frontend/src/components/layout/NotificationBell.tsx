'use client';

import Link from 'next/link';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  NotificationEmptyState,
  NotificationItem,
} from '@/components/notifications/NotificationItem';
import type { AppNotification } from '@/hooks/useNotifications';
import { HEADER_ICON_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';

export type { AppNotification };

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount?: number;
  isLoading?: boolean;
  onSelect?: (notification: AppNotification) => void;
  viewAllHref?: string;
}

export function NotificationBell({
  notifications,
  unreadCount,
  isLoading = false,
  onSelect,
  viewAllHref = '/notifications',
}: NotificationBellProps) {
  const unread = unreadCount ?? notifications.filter((n) => n.unread).length;
  const actionRequired = notifications.filter((n) => n.intent === 'action_required' && n.unread);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={cn('relative', HEADER_ICON_CONTROL_CLASS)}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,24rem)] p-0">
        <div className="border-b px-4 py-3">
          <DropdownMenuLabel className="flex items-center justify-between p-0 text-base">
            Notifications
            {unread > 0 && <Badge variant="destructive">{unread} unread</Badge>}
          </DropdownMenuLabel>
          {actionRequired.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {actionRequired.length} item{actionRequired.length === 1 ? '' : 's'} need your action
            </p>
          )}
        </div>

        <div className="max-h-[min(60vh,22rem)] overflow-y-auto p-2">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!isLoading && notifications.length === 0 && <NotificationEmptyState compact />}
          {!isLoading &&
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="cursor-pointer p-0 focus:bg-transparent"
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect?.(n);
                }}
              >
                <NotificationItem notification={n} compact className="border-0 shadow-none" />
              </DropdownMenuItem>
            ))}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="p-0">
          <Link
            href={viewAllHref}
            className="flex w-full justify-center px-4 py-3 text-center text-sm font-semibold text-sgvu-navy hover:bg-muted/50"
          >
            Open notification center
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

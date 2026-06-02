'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
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
import { cn } from '@/lib/utils';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: 'fee' | 'warning' | 'success' | 'info';
  unread: boolean;
  actionLink?: string | null;
  createdAt?: string;
}

interface NotificationBellProps {
  notifications: AppNotification[];
  /** Live unread total from API (overrides counting from list). */
  unreadCount?: number;
  onSelect?: (notification: AppNotification) => void;
  viewAllHref?: string;
}

const typeStyles: Record<AppNotification['type'], string> = {
  fee: 'bg-amber-100 text-amber-800',
  warning: 'bg-red-100 text-red-800',
  success: 'bg-emerald-100 text-emerald-800',
  info: 'bg-blue-100 text-blue-800',
};

export function NotificationBell({
  notifications,
  unreadCount,
  onSelect,
  viewAllHref = '/notifications',
}: NotificationBellProps) {
  const unread = unreadCount ?? notifications.filter((n) => n.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,20rem)]">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread > 0 && <Badge variant="destructive">{unread} new</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex cursor-pointer flex-col items-start gap-1 py-3"
              onSelect={(e) => {
                e.preventDefault();
                onSelect?.(n);
              }}
            >
              <div className="flex w-full items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', typeStyles[n.type])}>
                  {n.type}
                </span>
                {n.unread && <span className="ml-auto h-2 w-2 rounded-full bg-destructive" />}
              </div>
              <span className="font-medium text-foreground">{n.title}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={viewAllHref} className="w-full justify-center text-center font-medium text-sgvu-navy">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

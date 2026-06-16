'use client';

import { ArrowRight, BellOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/hooks/useNotifications';
import {
  CATEGORY_LABELS,
  INTENT_LABELS,
  SEVERITY_STYLES,
  categoryLabel,
  formatRelativeTime,
} from '@/lib/notifications/notification-display';

type NotificationItemProps = {
  notification: AppNotification;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
};

export function NotificationItem({
  notification,
  compact = false,
  onClick,
  className,
}: NotificationItemProps) {
  const n = notification;
  const severityStyle = SEVERITY_STYLES[n.severity];
  const intentLabel = INTENT_LABELS[n.intent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl border text-left transition hover:bg-muted/40',
        n.unread ? 'border-sgvu-gold/40 bg-sgvu-gold/5' : 'border-border/70 bg-background',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            severityStyle,
          )}
        >
          {categoryLabel(n.category)}
        </span>
        {n.intent === 'action_required' && (
          <Badge variant="destructive" className="text-[10px]">
            {intentLabel}
          </Badge>
        )}
        {n.intent !== 'action_required' && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {intentLabel}
          </span>
        )}
        {n.unread && (
          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden />
        )}
        {n.createdAt && (
          <span className={cn('text-xs text-muted-foreground', !n.unread && 'ml-auto')}>
            {formatRelativeTime(n.createdAt)}
          </span>
        )}
      </div>

      <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
        {n.title}
      </p>
      <p
        className={cn(
          'mt-1 text-muted-foreground',
          compact ? 'line-clamp-2 text-xs' : 'text-sm',
        )}
      >
        {n.body}
      </p>

      {n.actionLink && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sgvu-navy group-hover:underline">
          {n.actionLabel}
          <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export function NotificationEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center text-muted-foreground',
        compact ? 'px-3 py-8' : 'px-4 py-12',
      )}
    >
      <BellOff className="mb-2 h-8 w-8 opacity-40" />
      <p className="text-sm font-medium">You&apos;re all caught up</p>
      <p className="mt-1 text-xs">New alerts and pending actions will appear here.</p>
    </div>
  );
}

export const NOTIFICATION_CATEGORY_FILTERS = [
  { value: 'ALL', label: 'All categories' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

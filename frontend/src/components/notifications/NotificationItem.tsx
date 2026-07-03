'use client';

import type { SyntheticEvent } from 'react';
import { ArrowRight, BellOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/hooks/useNotifications';
import {
  CATEGORY_LABELS,
  INTENT_LABELS,
  INTENT_STYLES,
  META_PILL_CLASS,
  SEVERITY_STYLES,
  categoryLabel,
  formatRelativeTime,
} from '@/lib/notifications/notification-display';

type NotificationItemProps = {
  notification: AppNotification;
  compact?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function NotificationItem({
  notification,
  compact = false,
  onClick,
  onDismiss,
  className,
}: NotificationItemProps) {
  const n = notification;
  const severityStyle = SEVERITY_STYLES[n.severity];
  const intentLabel = INTENT_LABELS[n.intent];

  const stopDismissEvent = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={cn(
        'group w-full rounded-xl border text-left transition hover:border-sgvu-navy/20 hover:bg-muted/30',
        n.unread ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 shadow-sm' : 'border-border/70 bg-background',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={cn(META_PILL_CLASS, severityStyle)}>{categoryLabel(n.category)}</span>
          <span className={cn(META_PILL_CLASS, INTENT_STYLES[n.intent])}>{intentLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {n.createdAt && (
            <span className="whitespace-nowrap pt-0.5 text-xs text-muted-foreground">
              {formatRelativeTime(n.createdAt)}
            </span>
          )}
          {onDismiss && (
            <button
              type="button"
              data-notification-dismiss
              aria-label="Remove notification"
              onPointerDown={stopDismissEvent}
              onMouseDown={stopDismissEvent}
              onClick={(e) => {
                stopDismissEvent(e);
                onDismiss();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(onClick && 'cursor-pointer')}
      >
        <p className={cn('font-semibold text-sgvu-navy', compact ? 'text-sm' : 'text-base')}>
          {n.title}
        </p>
        <p
          className={cn(
            'mt-1 text-muted-foreground',
            compact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed',
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
      </div>
    </div>
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
  { value: 'ALL', label: 'All' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

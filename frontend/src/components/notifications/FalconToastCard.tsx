'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  INTENT_LABELS,
  SEVERITY_ACCENT,
  SEVERITY_STYLES,
  SEVERITY_TOAST_STYLES,
  categoryLabel,
  type NotificationIntent,
  type NotificationSeverity,
} from '@/lib/notifications/notification-display';

export type FalconToastCardProps = {
  title: string;
  message: string;
  severity?: NotificationSeverity;
  intent?: NotificationIntent;
  category?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export function FalconToastCard({
  title,
  message,
  severity = 'info',
  intent = 'info',
  category = 'OPERATIONS',
  actionLabel,
  onAction,
  onDismiss,
}: FalconToastCardProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative flex w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm',
        SEVERITY_TOAST_STYLES[severity],
      )}
    >
      <div className={cn('w-1 shrink-0', SEVERITY_ACCENT[severity])} aria-hidden />
      <div className="min-w-0 flex-1 p-4 pr-10">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              SEVERITY_STYLES[severity],
            )}
          >
            {categoryLabel(category)}
          </span>
          {intent === 'action_required' ? (
            <Badge variant="destructive" className="text-[10px]">
              {INTENT_LABELS[intent]}
            </Badge>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {INTENT_LABELS[intent]}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
        {actionLabel && onAction && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0 text-xs font-semibold text-sgvu-navy"
            onClick={() => {
              onAction();
              onDismiss?.();
            }}
          >
            {actionLabel}
          </Button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

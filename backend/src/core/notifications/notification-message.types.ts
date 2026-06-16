import type { FalconNotificationCategory } from '../../entities/falcon-notification.entity';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export type NotificationIntent =
  | 'info'
  | 'action_required'
  | 'status_update'
  | 'alert';

export type NotificationMessage = {
  category: FalconNotificationCategory;
  title: string;
  message: string;
  actionLink?: string;
  actionLabel?: string;
  severity: NotificationSeverity;
  intent: NotificationIntent;
  metadata?: Record<string, unknown>;
};

export type NotificationMessageOverrides = {
  title?: string;
  message?: string;
  actionLink?: string;
  actionLabel?: string;
};

/** Apply caller overrides while preserving catalog defaults for display fields. */
export function applyNotificationOverrides(
  base: NotificationMessage,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  if (!overrides) return base;
  return {
    ...base,
    title: overrides.title?.trim() || base.title,
    message: overrides.message?.trim() || base.message,
    actionLink: overrides.actionLink ?? base.actionLink,
    actionLabel: overrides.actionLabel ?? base.actionLabel,
  };
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return '';
  if (start && end && start !== end) return `${start} – ${end}`;
  return start ?? end ?? '';
}

export function humanizeRequestType(raw?: string): string {
  if (!raw) return 'request';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

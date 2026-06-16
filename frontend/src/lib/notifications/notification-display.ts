export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export type NotificationIntent =
  | 'info'
  | 'action_required'
  | 'status_update'
  | 'alert';

export const CATEGORY_LABELS: Record<string, string> = {
  ACADEMICS: 'Academics',
  FINANCE: 'Finance',
  HR: 'HR & Workforce',
  EXAMS: 'Exams',
  HOSTEL: 'Hostel',
  OPERATIONS: 'Operations',
  PLACEMENT: 'Placements',
  HELPDESK: 'Helpdesk',
};

export const SEVERITY_STYLES: Record<NotificationSeverity, string> = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

/** Full toast/card shell — left accent + soft background */
export const SEVERITY_TOAST_STYLES: Record<NotificationSeverity, string> = {
  info: 'border-blue-200 bg-blue-50/95 shadow-blue-100/50',
  success: 'border-emerald-200 bg-emerald-50/95 shadow-emerald-100/50',
  warning: 'border-amber-200 bg-amber-50/95 shadow-amber-100/50',
  critical: 'border-red-200 bg-red-50/95 shadow-red-100/50',
};

export const SEVERITY_ACCENT: Record<NotificationSeverity, string> = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

export const INTENT_LABELS: Record<NotificationIntent, string> = {
  info: 'Update',
  action_required: 'Action needed',
  status_update: 'Status',
  alert: 'Alert',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function resolveSeverity(raw?: string | null): NotificationSeverity {
  if (raw === 'success' || raw === 'warning' || raw === 'critical' || raw === 'info') {
    return raw;
  }
  return 'info';
}

export function resolveIntent(raw?: string | null): NotificationIntent {
  if (
    raw === 'action_required' ||
    raw === 'status_update' ||
    raw === 'alert' ||
    raw === 'info'
  ) {
    return raw;
  }
  return 'info';
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDay > 365 ? 'numeric' : undefined,
  });
}

export function defaultActionLabel(intent: NotificationIntent, actionLabel?: string | null): string {
  if (actionLabel?.trim()) return actionLabel.trim();
  if (intent === 'action_required') return 'Take action';
  return 'View details';
}

/** Legacy fallback when API rows predate severity/intent columns. */
export function inferSeverityFromCategory(category: string): NotificationSeverity {
  switch (category) {
    case 'FINANCE':
      return 'warning';
    case 'ACADEMICS':
    case 'EXAMS':
      return 'warning';
    case 'HR':
    case 'PLACEMENT':
      return 'success';
    default:
      return 'info';
  }
}

export function inferIntentFromTitle(title: string): NotificationIntent {
  const lower = title.toLowerCase();
  if (
    lower.includes('approval') ||
    lower.includes('pending') ||
    lower.includes('required') ||
    lower.includes('overdue') ||
    lower.includes('locked')
  ) {
    return 'action_required';
  }
  if (lower.includes('approved') || lower.includes('published') || lower.includes('declared')) {
    return 'status_update';
  }
  if (lower.includes('alert') || lower.includes('warning') || lower.includes('penalty')) {
    return 'alert';
  }
  return 'info';
}

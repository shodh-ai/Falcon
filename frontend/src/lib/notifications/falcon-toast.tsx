'use client';

import { toast as sonnerToast } from 'sonner';
import { FalconToastCard } from '@/components/notifications/FalconToastCard';
import { parseApiError } from '@/lib/notifications/parse-api-error';
import type { NotificationIntent, NotificationSeverity } from '@/lib/notifications/notification-display';

export type FalconToastOptions = {
  severity?: NotificationSeverity;
  intent?: NotificationIntent;
  category?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

export type ToastOptions = FalconToastOptions & {
  description?: string;
};

function showToast(
  title: string,
  message: string,
  options: FalconToastOptions = {},
) {
  const {
    severity = 'info',
    intent = 'info',
    category = inferCategory(title, message),
    actionLabel,
    onAction,
    duration = 7000,
  } = options;

  sonnerToast.custom(
    (id) => (
      <FalconToastCard
        title={title}
        message={message}
        severity={severity}
        intent={intent}
        category={category}
        actionLabel={actionLabel}
        onAction={onAction}
        onDismiss={() => sonnerToast.dismiss(id)}
      />
    ),
    { duration },
  );
}

function inferCategory(title: string, message: string): string {
  const text = `${title} ${message}`.toLowerCase();
  if (/fee|payment|finance|receipt|ledger|budget|scholarship|vendor/.test(text)) return 'FINANCE';
  if (/leave|gate pass|payroll|hr|onboarding|employee|attendance sync/.test(text)) return 'HR';
  if (/course|class|exam|grade|mark|attendance|timetable|syllabus|mentor|proctor/.test(text)) {
    return 'ACADEMICS';
  }
  if (/hostel|mess|room|warden|gate pass/.test(text)) return 'HOSTEL';
  if (/placement|drive|resume|company|hire/.test(text)) return 'PLACEMENT';
  if (/ticket|helpdesk|grievance/.test(text)) return 'HELPDESK';
  if (/library|book|catalog/.test(text)) return 'OPERATIONS';
  return 'OPERATIONS';
}

function splitLongMessage(message: string): { title: string; body: string } {
  const dashSplit = message.match(/^([^—–-]{4,80})[—–-]\s*(.+)$/);
  if (dashSplit) return { title: dashSplit[1].trim(), body: dashSplit[2].trim() };

  const sentenceSplit = message.match(/^(.{4,80}?[.!?])\s+([\s\S]+)$/);
  if (sentenceSplit) return { title: sentenceSplit[1].trim(), body: sentenceSplit[2].trim() };

  if (message.length <= 80) return { title: message, body: '' };
  return { title: `${message.slice(0, 77).trim()}…`, body: message };
}

function normalizeContent(
  message: string,
  description?: string,
): { title: string; body: string } {
  if (description) return { title: message, body: description };
  return splitLongMessage(message);
}

const PENDING_REQUEST_RE =
  /already have a pending request|pending schedule change|pending request of this type/i;

const ENHANCED_ERRORS: Array<{
  pattern: RegExp;
  title: string;
  body: (raw: string) => string;
  category?: string;
}> = [
  {
    pattern: PENDING_REQUEST_RE,
    title: 'You already have a pending request',
    body: () =>
      'A similar request is still awaiting approval. Check your pending list — submit again only after it is approved or rejected.',
    category: 'ACADEMICS',
  },
  {
    pattern: /required|must|enter|select|pick|describe|provide|short reason/i,
    title: 'Missing information',
    body: (raw) => raw,
    category: 'OPERATIONS',
  },
  {
    pattern: /expired|session|timeout/i,
    title: 'Session expired',
    body: (raw) => raw,
    category: 'OPERATIONS',
  },
  {
    pattern: /^Forbidden resource$/i,
    title: 'Action not allowed',
    body: () => 'Your current role cannot use this self-service action.',
    category: 'OPERATIONS',
  },
  {
    pattern: /unauthorized|sign in|logged in/i,
    title: 'Sign in required',
    body: (raw) => raw,
    category: 'OPERATIONS',
  },
  {
    pattern: /clash|conflict|duplicate|already exists/i,
    title: 'Conflict detected',
    body: (raw) => raw,
    category: 'OPERATIONS',
  },
];

function showEnhancedError(raw: string, options?: ToastOptions): boolean {
  for (const rule of ENHANCED_ERRORS) {
    if (!rule.pattern.test(raw)) continue;
    showToast(rule.title, rule.body(raw), {
      severity: 'warning',
      intent: 'action_required',
      category: rule.category ?? options?.category,
      ...options,
    });
    return true;
  }
  return false;
}

/** Map common API errors to descriptive Falcon toasts. */
export function falconToastFromError(
  err: unknown,
  context?: { category?: string; fallbackTitle?: string },
): void {
  const raw = err instanceof Error ? err.message : String(err ?? 'Something went wrong');
  if (showEnhancedError(raw, { category: context?.category })) return;

  const parsed = parseApiError(raw, context?.fallbackTitle);
  showToast(parsed.title, parsed.message, {
    severity: parsed.severity,
    intent: parsed.intent,
    category: context?.category ?? parsed.category,
  });
}

export const falconToast = {
  info(title: string, message: string, options?: FalconToastOptions) {
    showToast(title, message, { ...options, severity: 'info', intent: options?.intent ?? 'info' });
  },
  success(title: string, message: string, options?: FalconToastOptions) {
    showToast(title, message, {
      ...options,
      severity: 'success',
      intent: options?.intent ?? 'status_update',
    });
  },
  warning(title: string, message: string, options?: FalconToastOptions) {
    showToast(title, message, {
      ...options,
      severity: 'warning',
      intent: options?.intent ?? 'action_required',
    });
  },
  error(title: string, message: string, options?: FalconToastOptions) {
    showToast(title, message, { ...options, severity: 'critical', intent: options?.intent ?? 'alert' });
  },
  fromError: falconToastFromError,
};

/** Sonner-compatible API — every call renders the Falcon notification card. */
export const toast = {
  success(message: string, options?: ToastOptions) {
    const { title, body } = normalizeContent(message, options?.description);
    showToast(title, body, {
      ...options,
      severity: 'success',
      intent: options?.intent ?? 'status_update',
    });
  },
  error(message: string, options?: ToastOptions) {
    if (showEnhancedError(message, options)) return;

    if (options?.description) {
      const { title, body } = normalizeContent(message, options.description);
      showToast(title, body, {
        ...options,
        severity: 'critical',
        intent: options?.intent ?? 'alert',
      });
      return;
    }

    const parsed = parseApiError(message);
    showToast(parsed.title, parsed.message, {
      ...options,
      severity: parsed.severity,
      intent: parsed.intent,
      category: options?.category ?? parsed.category,
    });
  },
  info(message: string, options?: ToastOptions) {
    const { title, body } = normalizeContent(message, options?.description);
    showToast(title, body, {
      ...options,
      severity: 'info',
      intent: options?.intent ?? 'info',
    });
  },
  warning(message: string, options?: ToastOptions) {
    const { title, body } = normalizeContent(message, options?.description);
    showToast(title, body, {
      ...options,
      severity: 'warning',
      intent: options?.intent ?? 'action_required',
    });
  },
  message(message: string, options?: ToastOptions) {
    toast.info(message, options);
  },
  dismiss: sonnerToast.dismiss,
  custom: sonnerToast.custom,
};

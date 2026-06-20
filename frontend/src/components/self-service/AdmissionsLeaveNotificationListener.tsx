'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useRecentNotifications } from '@/hooks/useNotifications';
import { WORKFORCE_STATUS_REFRESH_EVENT } from '@/components/self-service/StaffLeaveStatusBanner';

const SEEN_KEY = 'falcon:admissions-leave-notification-ids';

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    /* ignore */
  }
}

function isLeaveDecisionNotification(title: string, category: string): boolean {
  if (category !== 'HR') return false;
  return /leave|on duty|regularization|approved|rejected/i.test(title);
}

/** Surfaces Falcon HR leave notifications as toasts on the admissions portal. */
export function AdmissionsLeaveNotificationListener() {
  const { notifications } = useRecentNotifications();
  const seenRef = useRef<Set<string>>(readSeen());

  useEffect(() => {
    let changed = false;

    for (const notification of notifications) {
      if (notification.is_read) continue;
      if (!isLeaveDecisionNotification(notification.title, notification.category)) continue;
      if (seenRef.current.has(notification.notification_id)) continue;

      seenRef.current.add(notification.notification_id);
      changed = true;

      const approved = /approved/i.test(notification.title);
      if (approved) {
        toast.success(notification.title, { description: notification.message });
      } else {
        toast.error(notification.title, { description: notification.message });
      }
    }

    if (changed) {
      writeSeen(seenRef.current);
      window.dispatchEvent(new CustomEvent(WORKFORCE_STATUS_REFRESH_EVENT));
    }
  }, [notifications]);

  return null;
}

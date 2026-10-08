/** Device-local account notification preferences (settings page). */

export const NOTIF_STORAGE_KEY = 'falcon.account.notificationPrefs';

export type NotificationPrefs = {
  inAppAlerts: boolean;
  examReminders: boolean;
  browserDesktop: boolean;
};

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  inAppAlerts: true,
  examReminders: true,
  browserDesktop: false,
};

export function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_NOTIF_PREFS;
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIF_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULT_NOTIF_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(prefs));
}

export function areInAppAlertsEnabled(): boolean {
  return loadNotificationPrefs().inAppAlerts;
}

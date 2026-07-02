import { API_URL, apiFetch, jsonHeaders } from './client';

export type FalconNotification = {
  notification_id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  title: string;
  message: string;
  action_link: string | null;
  severity?: string | null;
  intent?: string | null;
  action_label?: string | null;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

export const notificationsApi = {
  list: (token: string, limit = 50) =>
    apiFetch<FalconNotification[]>(token, {
      url: `${API_URL}/api/notifications?limit=${limit}`,
      headers: jsonHeaders(token),
    }),

  recent: (token: string) =>
    apiFetch<FalconNotification[]>(token, {
      url: `${API_URL}/api/notifications/recent`,
      headers: jsonHeaders(token),
    }),

  unreadCount: (token: string) =>
    apiFetch<{ count: number }>(token, {
      url: `${API_URL}/api/notifications/unread-count`,
      headers: jsonHeaders(token),
    }),

  markRead: (token: string, notificationId: string) =>
    apiFetch<FalconNotification>(token, {
      url: `${API_URL}/api/notifications/${notificationId}/read`,
      method: 'PATCH',
      headers: jsonHeaders(token),
    }),

  markAllRead: (token: string) =>
    apiFetch<{ updated: boolean }>(token, {
      url: `${API_URL}/api/notifications/mark-all-read`,
      method: 'POST',
      headers: jsonHeaders(token),
    }),

  dismiss: (token: string, notificationId: string) =>
    apiFetch<{ dismissed: boolean }>(token, {
      url: `${API_URL}/api/notifications/${notificationId}/dismiss`,
      method: 'PATCH',
      headers: jsonHeaders(token),
    }),
};

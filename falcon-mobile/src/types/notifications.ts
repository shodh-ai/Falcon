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

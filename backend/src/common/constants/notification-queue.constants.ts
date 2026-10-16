export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';

export type NotificationDeliveryJob = {
  notificationId?: string;
  tenantId: string;
  userId: string;
  category: string;
  title: string;
  message: string;
  actionLink?: string | null;
  actionLabel?: string | null;
  email?: string | null;
  phone?: string | null;
  channel?: string;
};

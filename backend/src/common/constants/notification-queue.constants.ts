export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';

export type NotificationDeliveryJob = {
  tenantId: string;
  userId: string;
  category: string;
  title: string;
  message: string;
  email?: string | null;
  phone?: string | null;
  channel?: string;
};

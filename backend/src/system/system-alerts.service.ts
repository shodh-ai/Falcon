import { Injectable } from '@nestjs/common';
import { FalconNotificationsService } from '../core/notifications/falcon-notifications.service';

/** @deprecated Use GET /api/notifications — kept for legacy dashboard calls. */
@Injectable()
export class SystemAlertsService {
  constructor(private readonly falconNotifications: FalconNotificationsService) {}

  async listUnreadForUser(userId: string, _tenantId: string) {
    const rows = await this.falconNotifications.listForUser(userId, 20);
    return rows
      .filter((r) => !r.is_read)
      .map((r) => ({
        alert_id: r.notification_id,
        title: r.title,
        message: r.message,
        is_read: r.is_read,
        created_at: r.created_at,
        action_link: r.action_link,
      }));
  }
}

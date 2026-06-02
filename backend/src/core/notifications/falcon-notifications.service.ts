import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FalconNotification,
  type FalconNotificationCategory,
} from '../../entities/falcon-notification.entity';

export type CreateFalconNotificationInput = {
  tenantId: string;
  userId: string;
  category: FalconNotificationCategory;
  title: string;
  message: string;
  actionLink?: string;
};

@Injectable()
export class FalconNotificationsService {
  constructor(
    @InjectRepository(FalconNotification)
    private readonly notifications: Repository<FalconNotification>,
  ) {}

  async create(input: CreateFalconNotificationInput): Promise<FalconNotification> {
    const row = this.notifications.create({
      tenant_id: input.tenantId,
      user_id: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      action_link: input.actionLink ?? null,
      is_read: false,
    });
    return this.notifications.save(row);
  }

  async listForUser(userId: string, limit = 50) {
    return this.notifications.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async listRecent(userId: string, limit = 5) {
    return this.listForUser(userId, limit);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.count({
      where: { user_id: userId, is_read: false },
    });
  }

  async markRead(notificationId: string, userId: string) {
    const row = await this.notifications.findOne({
      where: { notification_id: notificationId, user_id: userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    row.is_read = true;
    return this.notifications.save(row);
  }

  async markAllRead(userId: string) {
    await this.notifications.update({ user_id: userId, is_read: false }, { is_read: true });
    return { updated: true };
  }
}

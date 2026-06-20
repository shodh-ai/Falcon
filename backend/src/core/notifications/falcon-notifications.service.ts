import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  FalconNotification,
  type FalconNotificationCategory,
  type FalconNotificationIntent,
  type FalconNotificationSeverity,
} from '../../entities/falcon-notification.entity';

export type CreateFalconNotificationInput = {
  tenantId: string;
  userId: string;
  category: FalconNotificationCategory;
  title: string;
  message: string;
  actionLink?: string;
  severity?: FalconNotificationSeverity;
  intent?: FalconNotificationIntent;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
};

const MAX_LIST_LIMIT = 100;

@Injectable()
export class FalconNotificationsService {
  constructor(
    @InjectRepository(FalconNotification)
    private readonly notifications: Repository<FalconNotification>,
  ) {}

  async create(
    input: CreateFalconNotificationInput,
  ): Promise<FalconNotification> {
    const row = this.notifications.create({
      tenant_id: input.tenantId,
      user_id: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      action_link: input.actionLink ?? null,
      severity: input.severity ?? 'info',
      intent: input.intent ?? 'info',
      action_label: input.actionLabel ?? null,
      metadata: input.metadata ?? null,
      is_read: false,
    });
    return this.notifications.save(row);
  }

  private scopedWhere(tenantId: string, userId: string) {
    return {
      tenant_id: tenantId,
      user_id: userId,
      deleted_at: IsNull(),
    };
  }

  clampLimit(limit?: number): number {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed < 1) return 50;
    return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
  }

  async listForUser(tenantId: string, userId: string, limit = 50) {
    return this.notifications.find({
      where: this.scopedWhere(tenantId, userId),
      order: { created_at: 'DESC' },
      take: this.clampLimit(limit),
    });
  }

  async listRecent(tenantId: string, userId: string, limit = 5) {
    return this.listForUser(tenantId, userId, limit);
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    return this.notifications.count({
      where: { ...this.scopedWhere(tenantId, userId), is_read: false },
    });
  }

  async markRead(notificationId: string, tenantId: string, userId: string) {
    const row = await this.notifications.findOne({
      where: {
        notification_id: notificationId,
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Notification not found');
    row.is_read = true;
    return this.notifications.save(row);
  }

  async markAllRead(tenantId: string, userId: string) {
    await this.notifications.update(
      {
        tenant_id: tenantId,
        user_id: userId,
        is_read: false,
        deleted_at: IsNull(),
      },
      { is_read: true },
    );
    return { updated: true };
  }
}

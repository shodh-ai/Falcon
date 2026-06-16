import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../../common/constants/notification-queue.constants';
import { FalconNotificationsService } from './falcon-notifications.service';
import type { NotificationMessage } from './notification-message.types';

export type DispatchNotificationInput = NotificationMessage & {
  tenantId: string;
  userId: string;
  /** When false, only persist in-app (no email queue). Default true. */
  queueDelivery?: boolean;
};

@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly falconNotifications: FalconNotificationsService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async dispatch(input: DispatchNotificationInput) {
    const row = await this.falconNotifications.create({
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      actionLink: input.actionLink,
      severity: input.severity,
      intent: input.intent,
      actionLabel: input.actionLabel,
      metadata: input.metadata,
    });

    if (input.queueDelivery === false) return row;

    const contact = await this.dataSource.query<Array<{ official_email: string | null }>>(
      `SELECT official_email FROM users WHERE user_id = $1 LIMIT 1`,
      [input.userId],
    );

    const job: NotificationDeliveryJob = {
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      email: contact[0]?.official_email ?? null,
    };

    await this.deliveryQueue.add('send-email-whatsapp', job, {
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return row;
  }

  async dispatchToMany(
    tenantId: string,
    userIds: string[],
    message: NotificationMessage,
    options?: { queueDelivery?: boolean },
  ) {
    for (const userId of userIds) {
      await this.dispatch({
        tenantId,
        userId,
        ...message,
        queueDelivery: options?.queueDelivery,
      });
    }
  }
}

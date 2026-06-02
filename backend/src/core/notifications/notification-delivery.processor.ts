import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../../common/constants/notification-queue.constants';
import { NotificationsService } from './notifications.service';

@Processor(NOTIFICATION_DELIVERY_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(private readonly channels: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationDeliveryJob>) {
    const { email, title, message, userId } = job.data;
    if (email) {
      await this.channels.sendEmail(email, title, message);
    }
    await this.channels.sendInApp(userId, {
      title,
      message,
      category: job.data.category,
    });
    this.logger.debug(`Delivered notification channels for user ${userId}`);
  }
}

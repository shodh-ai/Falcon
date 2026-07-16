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
    const { email, phone, title, message, userId, channel } = job.data;
    const deliveryChannel = (channel ?? 'EMAIL').toUpperCase();

    if (deliveryChannel === 'EMAIL' && email) {
      await this.channels.sendEmail(email, title, message);
    } else if (deliveryChannel === 'SMS' && phone) {
      await this.channels.sendSms(phone, `${title}: ${message}`);
    } else if (deliveryChannel === 'WHATSAPP' && phone) {
      await this.channels.sendSms(phone, `[WhatsApp] ${title}: ${message}`);
    } else if (email && deliveryChannel !== 'IN_APP') {
      await this.channels.sendEmail(email, title, message);
    }
    this.logger.debug(`Delivered ${deliveryChannel} notification for user ${userId}`);
  }
}

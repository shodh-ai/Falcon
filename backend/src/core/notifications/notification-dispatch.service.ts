import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  portalEmailDeliveryEnabled,
  safeEmailRecipient,
} from '../../common/email/falcon-email-sender';
import { notificationActivation } from './notification-activation';
import { notificationJobRetention } from './notification-delivery-policy';

export type DispatchNotificationInput = NotificationMessage & {
  tenantId: string;
  userId: string;
  /** When false, only persist in-app (no email queue). Default true. */
  queueDelivery?: boolean;
};

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly falconNotifications: FalconNotificationsService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly deliveryQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async dispatch(input: DispatchNotificationInput) {
    // Resolve eligibility before writing an inbox entry or queuing delivery.
    const channel = (
      (input.metadata?.channel as string | undefined) ?? 'EMAIL'
    ).toUpperCase();
    const usesPhone = channel === 'SMS' || channel === 'WHATSAPP';
    const contact = await this.dataSource.query<
      Array<{ official_email: string | null; phone: string | null }>
    >(
      `SELECT u.official_email, ${usesPhone ? 'sp.phone' : 'NULL AS phone'} FROM users u
       ${usesPhone ? 'LEFT JOIN student_profiles sp ON sp.user_id = u.user_id' : ''}
       INNER JOIN tenants t ON t.tenant_id = u.tenant_id AND t.is_active = true
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [input.userId, input.tenantId],
    );
    if (contact.length !== 1)
      throw new Error('Notification recipient unavailable');

    const metadata = { ...input.metadata };
    // Delivery intent is server-owned; callers must not forge replay metadata.
    delete metadata.emailDelivery;
    const read = (key: string) => this.config?.get<unknown>(key);
    let activation: ReturnType<typeof notificationActivation> | undefined;
    if (
      input.queueDelivery !== false &&
      channel === 'EMAIL' &&
      portalEmailDeliveryEnabled(read) &&
      safeEmailRecipient(contact[0].official_email)
    ) {
      try {
        activation = notificationActivation(read);
        metadata.emailDelivery = {
          state: 'pending',
          queuePrefix: activation.prefix,
          activatedAfter: new Date(activation.timestamp).toISOString(),
        };
      } catch {
        this.logger.warn('Portal email not queued (ACTIVATION_REQUIRED)');
      }
    }

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
      metadata: input.metadata || activation ? metadata : undefined,
    });

    if (input.queueDelivery === false) return row;
    // Disabled or unconfigured email delivery creates no dormant mail backlog.
    if (channel === 'EMAIL' && !activation) return row;

    const job: NotificationDeliveryJob = {
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      email: safeEmailRecipient(contact[0].official_email)
        ? contact[0].official_email
        : null,
      phone: contact[0]?.phone ?? null,
      channel,
      notificationId: row.notification_id,
      actionLink: input.actionLink,
      actionLabel: input.actionLabel,
    };

    try {
      if (
        activation &&
        (this.deliveryQueue.name !== NOTIFICATION_DELIVERY_QUEUE ||
          this.deliveryQueue.opts.prefix !== activation.prefix)
      ) {
        throw new Error('Notification queue activation mismatch');
      }
      await this.deliveryQueue.add('send-email-whatsapp', job, {
        jobId: row.notification_id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        ...notificationJobRetention(),
      });
    } catch {
      // The saved pending intent is retried by the scoped outbox reconciler.
      this.logger.warn('Portal notification enqueue deferred (QUEUE_FAILURE)');
      if (channel !== 'EMAIL') {
        throw new Error('Portal notification enqueue failed (QUEUE_FAILURE)');
      }
    }

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

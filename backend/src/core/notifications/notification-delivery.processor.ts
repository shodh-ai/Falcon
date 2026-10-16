import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  BeforeApplicationShutdown,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DelayedError, Job, UnrecoverableError, type Worker } from 'bullmq';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../../common/constants/notification-queue.constants';
import { NotificationsService } from './notifications.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { safeEmailRecipient } from '../../common/email/falcon-email-sender';
import { ConfigService } from '@nestjs/config';
import { notificationActivation } from './notification-activation';
import { notificationEmailBody } from './notification-email-body';
import { notificationDeliveryLimiter } from './notification-delivery-policy';
import { NotificationWorkerLifecycle } from './notification-worker-lifecycle';

/** PostgreSQL UPDATE RETURNING uses [rows, count] in installed TypeORM. */
function updateRows(result: unknown): Record<string, unknown>[] {
  const rows =
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number' &&
    result[0].length === result[1]
      ? result[0]
      : result;
  if (
    !Array.isArray(rows) ||
    !rows.every(
      (row) => row !== null && typeof row === 'object' && !Array.isArray(row),
    )
  ) {
    throw new UnrecoverableError('Portal email claim requires review');
  }
  return rows as Record<string, unknown>[];
}

@Processor(NOTIFICATION_DELIVERY_QUEUE, {
  autorun: false,
  limiter: notificationDeliveryLimiter(),
})
export class NotificationDeliveryProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);
  private readonly lifecycle = new NotificationWorkerLifecycle();

  constructor(
    private readonly channels: NotificationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    // Hold the whole shared queue, including phone jobs, until explicitly enabled.
    // The Bull registrar constructs this worker during onModuleInit.
    if (this.lifecycle.isStopping() || !this.channels.isEmailDeliveryEnabled())
      return;
    try {
      notificationActivation((key) => this.config.get<unknown>(key));
    } catch {
      this.logger.warn(
        'Portal notification worker disabled (ACTIVATION_REQUIRED)',
      );
      return;
    }
    try {
      // Validate without creating a transport or contacting SMTP. A bad deploy
      // must leave saved delivery intents untouched for a corrected restart.
      this.channels.validateEmailDeliveryConfiguration();
      notificationEmailBody(
        '',
        '/notifications',
        this.config.get<unknown>('FRONTEND_URL'),
        this.config.get<unknown>('NODE_ENV'),
      );
    } catch {
      this.logger.warn(
        'Portal notification worker disabled (DELIVERY_CONFIGURATION)',
      );
      return;
    }
    if (this.worker.isRunning()) return;
    void this.worker.run().catch(() => {
      this.logger.warn('Portal notification worker stopped (QUEUE_FAILURE)');
    });
  }

  @OnWorkerEvent('error')
  onWorkerError(): void {
    this.logger.warn('Portal notification worker error (QUEUE_FAILURE)');
  }

  isDeliveryRunning(): boolean {
    try {
      return (
        !this.lifecycle.isStopping() &&
        !this.worker.closing &&
        this.worker.isRunning() &&
        !this.worker.isPaused()
      );
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.lifecycle.stopAccepting();
    try {
      this.lifecycle.stopAccepting(this.worker);
    } catch {
      // No worker was registered in this runtime.
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.lifecycle.stopAccepting();
    let worker: typeof this.worker;
    try {
      worker = this.worker;
    } catch {
      return; // Disabled/manual Bull registration may not construct a worker.
    }
    await this.closeWorker(worker);
  }

  async closeWorker(worker: Worker): Promise<void> {
    const result = await this.lifecycle.close(worker);
    if (!result.drained || !result.closed) {
      this.logger.warn('Portal notification shutdown requires review');
    }
  }

  process(job: Job<NotificationDeliveryJob>, token?: string) {
    return this.lifecycle.run(() => this.deliver(job, token));
  }

  private async deliver(job: Job<NotificationDeliveryJob>, token?: string) {
    if (!this.channels.isEmailDeliveryEnabled()) {
      // A configuration change during processing must not complete pending jobs.
      await job.moveToDelayed(Date.now() + 60_000, token);
      throw new DelayedError();
    }
    const policy = notificationActivation((key) =>
      this.config.get<unknown>(key),
    );
    if (
      job.queueQualifiedName !==
        `${policy.prefix}:${NOTIFICATION_DELIVERY_QUEUE}` ||
      !Number.isFinite(job.timestamp) ||
      job.timestamp < policy.timestamp
    ) {
      // Preserve the job; do not complete, delete, retry or send historical mail.
      await job.moveToDelayed(Date.now() + 86_400_000, token);
      throw new DelayedError();
    }
    const { email, phone, title, message, userId, tenantId, channel } =
      job.data;
    const deliveryChannel = (channel ?? 'EMAIL').toUpperCase();
    if (deliveryChannel === 'IN_APP') return;
    if (!['EMAIL', 'SMS', 'WHATSAPP'].includes(deliveryChannel)) return;
    if (
      deliveryChannel === 'EMAIL' &&
      (typeof job.data.notificationId !== 'string' ||
        !job.data.notificationId ||
        job.id !== job.data.notificationId)
    ) {
      // Fresh email jobs require a persisted, scoped delivery intent.
      return;
    }
    const usesPhone =
      deliveryChannel === 'SMS' || deliveryChannel === 'WHATSAPP';
    const contact = await this.dataSource.query<
      Array<{ official_email: string | null; phone: string | null }>
    >(
      `SELECT u.official_email, ${usesPhone ? 'sp.phone' : 'NULL AS phone'} FROM users u
       INNER JOIN tenants t ON t.tenant_id = u.tenant_id AND t.is_active = true
       ${usesPhone ? 'LEFT JOIN student_profiles sp ON sp.user_id = u.user_id' : ''}
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId, tenantId],
    );
    if (contact.length !== 1) return;
    if (!this.lifecycle.mayStartDelivery()) {
      throw new Error('Portal notification shutdown requires review');
    }

    if (deliveryChannel === 'EMAIL') {
      const canonicalEmail = contact[0].official_email;
      if (
        !safeEmailRecipient(canonicalEmail) ||
        typeof email !== 'string' ||
        canonicalEmail.toLowerCase() !== email.toLowerCase()
      ) {
        return;
      }
      const cutoff = new Date(policy.timestamp).toISOString();
      const receiptParams = [
        job.data.notificationId,
        tenantId,
        userId,
        cutoff,
        policy.prefix,
      ];
      const claimed = updateRows(
        await this.dataSource.query<unknown>(
          `UPDATE falcon_notifications
           SET metadata = jsonb_set(metadata, '{emailDelivery,state}',
                 '"sending"'::jsonb, false)
           WHERE notification_id = $1 AND tenant_id = $2 AND user_id = $3
             AND deleted_at IS NULL AND created_at >= $4::text::timestamptz
             AND metadata->'emailDelivery'->>'state' IN ('pending', 'queued')
             AND metadata->'emailDelivery'->>'queuePrefix' = $5
             AND metadata->'emailDelivery'->>'activatedAfter' = $4::text
           RETURNING title, message, action_link`,
          receiptParams,
        ),
      );
      // An existing claim/receipt or concurrent worker cannot send again.
      if (claimed.length === 0) return;
      if (claimed.length !== 1) {
        throw new UnrecoverableError('Portal email claim requires review');
      }
      try {
        const saved = claimed[0];
        if (
          typeof saved.title !== 'string' ||
          typeof saved.message !== 'string' ||
          !(saved.action_link === null || typeof saved.action_link === 'string')
        ) {
          throw new Error();
        }
        if (!this.lifecycle.mayStartDelivery()) throw new Error();
        const body = notificationEmailBody(
          saved.message,
          saved.action_link,
          this.config.get<unknown>('FRONTEND_URL'),
          this.config.get<unknown>('NODE_ENV'),
        );
        if (
          !(await this.channels.sendEmail(canonicalEmail, saved.title, body))
        ) {
          throw new Error();
        }
      } catch {
        try {
          await this.dataSource.query(
            `UPDATE falcon_notifications
             SET metadata = jsonb_set(metadata, '{emailDelivery,state}',
                   '"review_required"'::jsonb, false)
             WHERE notification_id = $1 AND tenant_id = $2 AND user_id = $3
               AND deleted_at IS NULL AND created_at >= $4::text::timestamptz
               AND metadata->'emailDelivery'->>'state' = 'sending'
               AND metadata->'emailDelivery'->>'queuePrefix' = $5
               AND metadata->'emailDelivery'->>'activatedAfter' = $4::text`,
            receiptParams,
          );
        } catch {
          // Retain the sending claim when the outcome cannot be persisted.
        }
        // SMTP failures can be ambiguous: never automatically resend.
        throw new UnrecoverableError('Portal email delivery requires review');
      }
      try {
        const accepted = updateRows(
          await this.dataSource.query<unknown>(
            `UPDATE falcon_notifications
             SET metadata = jsonb_set(jsonb_set(metadata, '{emailDelivery,state}',
                   '"accepted"'::jsonb, false), '{emailDelivery,acceptedAt}', to_jsonb(NOW()), true)
             WHERE notification_id = $1 AND tenant_id = $2 AND user_id = $3
               AND deleted_at IS NULL AND created_at >= $4::text::timestamptz
               AND metadata->'emailDelivery'->>'state' = 'sending'
               AND metadata->'emailDelivery'->>'queuePrefix' = $5
               AND metadata->'emailDelivery'->>'activatedAfter' = $4::text
             RETURNING notification_id`,
            receiptParams,
          ),
        );
        if (
          accepted.length !== 1 ||
          accepted[0].notification_id !== job.data.notificationId
        ) {
          throw new Error();
        }
      } catch {
        // SMTP already accepted: retain the sending claim and require review.
        throw new UnrecoverableError('Portal email receipt requires review');
      }
      this.logger.debug('Portal email accepted by SMTP');
    } else if (deliveryChannel === 'SMS' && phone) {
      if (phone === contact[0].phone) {
        await this.channels.sendSms(phone, `${title}: ${message}`);
      }
    } else if (deliveryChannel === 'WHATSAPP' && phone) {
      if (phone === contact[0].phone) {
        await this.channels.sendSms(phone, `[WhatsApp] ${title}: ${message}`);
      }
    }
  }
}

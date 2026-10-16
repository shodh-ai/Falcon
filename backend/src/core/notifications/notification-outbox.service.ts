import { InjectQueue } from '@nestjs/bullmq';
import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../../common/constants/notification-queue.constants';
import {
  portalEmailDeliveryEnabled,
  safeEmailRecipient,
} from '../../common/email/falcon-email-sender';
import { notificationActivation } from './notification-activation';
import { notificationJobRetention } from './notification-delivery-policy';

type PendingNotification = {
  notification_id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  title: string;
  message: string;
  action_link: string | null;
  action_label: string | null;
  official_email: string | null;
  delivery_state: 'pending' | 'queued';
};

/** Reconcile only explicitly activated, newly persisted email delivery intents. */
@Injectable()
export class NotificationOutboxService
  implements
    OnApplicationBootstrap,
    OnModuleDestroy,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationOutboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private flushing = false;
  private stopping = false;
  private inFlight?: Promise<{ queued: number; skipped: number }>;
  private shutdown?: Promise<void>;
  private queueClient?: { disconnect(): void };
  private queueClientCaptureStarted = false;
  private forceQueueDisconnect = false;

  constructor(
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly queue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private activation() {
    const read = (key: string) => this.config.get<unknown>(key);
    if (!portalEmailDeliveryEnabled(read)) return undefined;
    try {
      const policy = notificationActivation(read);
      if (
        this.queue.name !== NOTIFICATION_DELIVERY_QUEUE ||
        this.queue.opts.prefix !== policy.prefix
      ) {
        return undefined;
      }
      return policy;
    } catch {
      return undefined;
    }
  }

  onApplicationBootstrap(): void {
    if (this.stopping || this.timer) return;
    // Keep the actual queue-owned client while healthy. Bull's public
    // disconnect() awaits its initialization promise and can itself wait
    // indefinitely during a reconnect; the captured client can stop it.
    if (!this.queueClientCaptureStarted) {
      this.queueClientCaptureStarted = true;
      try {
        void this.queue.client.then(
          (client) => {
            this.queueClient = client;
            if (this.forceQueueDisconnect) this.disconnectQueueClient();
          },
          () => undefined,
        );
      } catch {
        // A failed queue initialization must not prevent shutdown safeguards.
      }
    }
    if (!this.activation()) return;
    this.timer = setInterval(() => void this.flush(), 30_000);
    this.timer.unref?.();
    void this.flush();
  }

  onModuleDestroy(): Promise<void> {
    // This runs before Nest's before/onApplicationShutdown hooks. Stop
    // producers synchronously, before worker and database teardown begins.
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (!this.shutdown) this.shutdown = this.drainAndCloseQueue();
    return this.shutdown;
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.onModuleDestroy();
  }

  onApplicationShutdown(): Promise<void> {
    return this.onModuleDestroy();
  }

  private disconnectQueueClient(): void {
    try {
      this.queueClient?.disconnect();
    } catch {
      // Connector details must never escape into shutdown logs.
    }
  }

  private async withinDeadline(
    operation: Promise<unknown> | undefined,
    milliseconds: number,
  ): Promise<boolean> {
    if (!operation) return true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation.then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), milliseconds);
          timeout.unref?.();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async drainAndCloseQueue(): Promise<void> {
    // Waiting for Redis indefinitely cannot make an intent safer. Existing
    // pending/queued/sending/accepted database states remain untouched.
    await this.withinDeadline(this.inFlight, 5_000);
    const close = Promise.resolve().then(() => this.queue.close());
    if (!(await this.withinDeadline(close, 2_000))) {
      // Ioredis rejects pending QUIT/commands on disconnect, allowing Bull's
      // cached close promise to settle before Nest invokes it again.
      this.forceQueueDisconnect = true;
      this.disconnectQueueClient();
    }
  }

  isReconciliationReady(): boolean {
    return !!this.timer && !this.stopping && !!this.activation();
  }

  private async markState(
    row: PendingNotification,
    cutoff: string,
    prefix: string,
    state: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE falcon_notifications
       SET metadata = jsonb_set(metadata, '{emailDelivery,state}',
             to_jsonb($6::text), false)
       WHERE notification_id = $1 AND tenant_id = $2 AND user_id = $3
         AND deleted_at IS NULL AND created_at >= $4::text::timestamptz
         AND metadata->'emailDelivery'->>'state' IN ('pending', 'queued')
         AND metadata->'emailDelivery'->>'queuePrefix' = $5
         AND metadata->'emailDelivery'->>'activatedAfter' = $4::text`,
      [row.notification_id, row.tenant_id, row.user_id, cutoff, prefix, state],
    );
  }

  flush(): Promise<{ queued: number; skipped: number }> {
    const policy = this.activation();
    if (this.stopping || !policy || this.flushing)
      return Promise.resolve({ queued: 0, skipped: 0 });
    this.flushing = true;
    this.inFlight = this.reconcile(policy);
    return this.inFlight;
  }

  private async reconcile(
    policy: ReturnType<typeof notificationActivation>,
  ): Promise<{ queued: number; skipped: number }> {
    let queued = 0;
    let skipped = 0;
    const cutoff = new Date(policy.timestamp).toISOString();
    try {
      const rows = await this.dataSource.query<PendingNotification[]>(
        `SELECT n.notification_id, n.tenant_id, n.user_id, n.category,
                n.title, n.message, n.action_link, n.action_label,
                u.official_email,
                n.metadata->'emailDelivery'->>'state' AS delivery_state
         FROM falcon_notifications n
         INNER JOIN users u ON u.user_id = n.user_id
           AND u.tenant_id = n.tenant_id AND u.is_active = true
           AND u.deleted_at IS NULL
         INNER JOIN tenants t ON t.tenant_id = u.tenant_id AND t.is_active = true
         WHERE n.deleted_at IS NULL AND n.created_at >= $1::text::timestamptz
           AND n.metadata->'emailDelivery'->>'state' IN ('pending', 'queued')
           AND n.metadata->'emailDelivery'->>'queuePrefix' = $2
           AND n.metadata->'emailDelivery'->>'activatedAfter' = $1::text
         ORDER BY CASE WHEN n.metadata->'emailDelivery'->>'state' = 'pending'
                   THEN 0 ELSE 1 END,
                  n.created_at ASC, n.notification_id ASC
         LIMIT 100`,
        [cutoff, policy.prefix],
      );
      for (const row of rows) {
        if (this.stopping) break;
        try {
          if (!safeEmailRecipient(row.official_email)) {
            // A malformed canonical address needs review, not endless replay.
            await this.markState(row, cutoff, policy.prefix, 'review_required');
            skipped += 1;
            continue;
          }
          const existing = await this.queue.getJob(row.notification_id);
          if (this.stopping) break;
          let state = 'queued';
          if (existing) {
            const jobState = await existing.getState();
            if (this.stopping) break;
            // Do not replay failed mail, or mail whose SMTP/DB outcome is unknown.
            if (jobState === 'completed' || jobState === 'failed') {
              state = 'review_required';
            }
            skipped += 1;
          } else {
            const job: NotificationDeliveryJob = {
              notificationId: row.notification_id,
              tenantId: row.tenant_id,
              userId: row.user_id,
              category: row.category,
              title: row.title,
              message: row.message,
              actionLink: row.action_link ?? undefined,
              actionLabel: row.action_label ?? undefined,
              email: row.official_email,
              channel: 'EMAIL',
            };
            await this.queue.add('send-email-whatsapp', job, {
              jobId: row.notification_id,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
              ...notificationJobRetention(),
            });
            queued += 1;
          }
          if (row.delivery_state !== state) {
            await this.markState(row, cutoff, policy.prefix, state);
          }
        } catch {
          this.logger.warn('Portal email outbox deferred (QUEUE_FAILURE)');
        }
      }
    } catch {
      this.logger.warn('Portal email outbox unavailable (OUTBOX_FAILURE)');
    } finally {
      this.flushing = false;
      this.inFlight = undefined;
    }
    return { queued, skipped };
  }
}

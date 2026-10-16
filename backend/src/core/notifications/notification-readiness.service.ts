import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { NOTIFICATION_DELIVERY_QUEUE } from '../../common/constants/notification-queue.constants';
import { notificationActivation } from './notification-activation';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { notificationEmailBody } from './notification-email-body';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationsService } from './notifications.service';

function supportsPing(value: unknown): value is { ping(): Promise<unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ping' in value &&
    typeof value.ping === 'function'
  );
}

/** Queue readiness only; never authenticates SMTP or sends/claims notification jobs. */
@Injectable()
export class NotificationReadinessService {
  private inFlight?: Promise<boolean>;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
    private readonly channels: NotificationsService,
    private readonly processor: NotificationDeliveryProcessor,
    private readonly outbox: NotificationOutboxService,
  ) {}

  private configurationReady(): boolean {
    try {
      if (!this.channels.isEmailDeliveryEnabled()) return false;
      this.channels.validateEmailDeliveryConfiguration();
      const policy = notificationActivation((key) =>
        this.config.get<unknown>(key),
      );
      notificationEmailBody(
        '',
        '/notifications',
        this.config.get<unknown>('FRONTEND_URL'),
        this.config.get<unknown>('NODE_ENV'),
      );
      return (
        this.queue.name === NOTIFICATION_DELIVERY_QUEUE &&
        this.queue.opts.prefix === policy.prefix &&
        !this.queue.closing &&
        this.processor.isDeliveryRunning() &&
        this.outbox.isReconciliationReady()
      );
    } catch {
      return false;
    }
  }

  private probe(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    let timeout: ReturnType<typeof setTimeout>;
    const pending = Promise.allSettled([
      Promise.resolve().then(() =>
        this.db.query<Array<{ notification_ready: number }>>(
          'SELECT 1 AS notification_ready',
        ),
      ),
      Promise.resolve().then(async () => {
        // Installed BullMQ's ioredis adapter forwards PING although its generic
        // interface omits it. Refuse adapters that cannot perform this probe.
        const client = await this.queue.client;
        if (!supportsPing(client)) throw new Error();
        return client.ping();
      }),
      Promise.resolve().then(() => this.queue.isPaused()),
    ]).then(
      ([database, redis, queueState]) =>
        database.status === 'fulfilled' &&
        redis.status === 'fulfilled' &&
        queueState.status === 'fulfilled' &&
        Array.isArray(database.value) &&
        database.value.length === 1 &&
        database.value[0]?.notification_ready === 1 &&
        redis.value === 'PONG' &&
        queueState.value === false,
    );
    const bounded = Promise.race([
      pending,
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 1_500);
        timeout.unref?.();
      }),
    ]);
    this.inFlight = bounded;
    // A response timeout cannot cancel pg/ioredis I/O. Retain this single flight
    // until the underlying calls settle, so repeated probes cannot pile up.
    void pending.then(() => {
      clearTimeout(timeout);
      if (this.inFlight === bounded) this.inFlight = undefined;
    });
    return bounded;
  }

  async check(): Promise<{ status: 'ok' }> {
    if (
      !this.configurationReady() ||
      !(await this.probe()) ||
      !this.configurationReady()
    )
      throw new ServiceUnavailableException(
        'Notification delivery unavailable',
      );
    return { status: 'ok' };
  }
}

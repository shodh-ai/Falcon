/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- TypeORM query() rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { createSign } from 'crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class AcquisitionOutboxPublisher {
  private readonly logger = new Logger(AcquisitionOutboxPublisher.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Interval(30_000)
  async publish() {
    const privateKey = this.config.get<string>(
      'IRMS_CALLBACK_SIGNING_PRIVATE_KEY',
    );
    if (!privateKey) return;
    const rows = await this.db.transaction(async (manager) =>
      manager.query(
        `WITH candidates AS (
         SELECT o.event_id
         FROM acq_outbox_events o
         JOIN acq_request_versions v ON v.acquisition_version_id=o.aggregate_id
         JOIN acq_requests r ON r.acquisition_id=v.acquisition_id
         JOIN LATERAL (
           SELECT c.callback_url
           FROM acq_integration_clients c
           WHERE c.tenant_id=r.tenant_id AND c.is_active=true AND c.callback_url IS NOT NULL
             AND (r.integration_client_id IS NULL OR c.integration_client_id=r.integration_client_id)
           ORDER BY (c.integration_client_id=r.integration_client_id) DESC, c.created_at
           LIMIT 1
         ) c ON true
         WHERE o.status IN ('PENDING','FAILED') AND o.available_at<=NOW()
           AND o.attempts<10
         ORDER BY o.created_at
         LIMIT 10 FOR UPDATE OF o SKIP LOCKED
       ), claimed AS (
         UPDATE acq_outbox_events o
         SET status='PROCESSING',attempts=attempts+1
         FROM candidates c
         WHERE o.event_id=c.event_id
         RETURNING o.*
       )
       SELECT claimed.*, clients.callback_url
       FROM claimed
       JOIN acq_request_versions v ON v.acquisition_version_id=claimed.aggregate_id
       JOIN acq_requests r ON r.acquisition_id=v.acquisition_id
       JOIN LATERAL (
         SELECT c.callback_url
         FROM acq_integration_clients c
         WHERE c.tenant_id=r.tenant_id AND c.is_active=true AND c.callback_url IS NOT NULL
           AND (r.integration_client_id IS NULL OR c.integration_client_id=r.integration_client_id)
         ORDER BY (c.integration_client_id=r.integration_client_id) DESC, c.created_at
         LIMIT 1
       ) clients ON true`,
      ),
    );
    for (const event of rows) {
      await this.publishOne(event, privateKey.replace(/\\n/g, '\n'));
    }
  }

  private async publishOne(event: Record<string, any>, privateKey: string) {
    const callback = new URL(String(event.callback_url));
    if (callback.protocol !== 'https:') {
      await this.fail(event.event_id, 'Callback URL must use HTTPS');
      return;
    }
    const allowlist = String(
      this.config.get('IRMS_CALLBACK_HOST_ALLOWLIST') ?? '',
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (
      allowlist.length &&
      !allowlist.includes(callback.hostname.toLowerCase())
    ) {
      await this.fail(event.event_id, 'Callback host is not allowlisted');
      return;
    }
    const body = JSON.stringify(event.payload);
    const signature = createSign('RSA-SHA256')
      .update(body)
      .end()
      .sign(privateKey, 'base64');
    try {
      const response = await fetch(callback, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'content-type': 'application/json',
          'x-falcon-event-id': event.event_id,
          'x-falcon-signature': `rsa-sha256=${signature}`,
        },
        body,
      });
      if (!response.ok) throw new Error(`Callback returned ${response.status}`);
      await this.db.query(
        `UPDATE acq_outbox_events SET status='PUBLISHED',published_at=NOW(),last_error=NULL
         WHERE event_id=$1`,
        [event.event_id],
      );
    } catch (error) {
      await this.fail(
        event.event_id,
        error instanceof Error ? error.message : 'Callback failed',
      );
    }
  }

  private async fail(eventId: string, message: string) {
    this.logger.warn(`Acquisition callback ${eventId}: ${message}`);
    await this.db.query(
      `UPDATE acq_outbox_events SET status='FAILED',last_error=$2,
         available_at=NOW()+(LEAST(attempts+1,10) || ' minutes')::interval
       WHERE event_id=$1`,
      [eventId, message.slice(0, 1000)],
    );
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- TypeORM query rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { createSign } from 'crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class ProductVerificationOutboxPublisher {
  private readonly logger = new Logger(ProductVerificationOutboxPublisher.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Interval(30_000)
  async publish() {
    const endpoint = this.config.get<string>(
      'PRODUCT_VERIFICATION_EVENT_WEBHOOK_URL',
    );
    const privateKey = this.config.get<string>(
      'PRODUCT_VERIFICATION_EVENT_SIGNING_PRIVATE_KEY',
    );
    if (!endpoint || !privateKey) return;
    const target = new URL(endpoint);
    const allowlist = String(
      this.config.get('PRODUCT_VERIFICATION_EVENT_HOST_ALLOWLIST') ?? '',
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (
      target.protocol !== 'https:' ||
      !allowlist.includes(target.hostname.toLowerCase())
    ) {
      this.logger.error(
        'Product verification webhook must use HTTPS and an allowlisted host',
      );
      return;
    }
    const events = await this.db.transaction((manager) =>
      manager.query(
        `WITH candidates AS (
         SELECT event_id FROM pv_outbox_events WHERE status IN ('PENDING','FAILED')
           AND available_at<=NOW() AND attempts<10 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
       ) UPDATE pv_outbox_events e SET status='PROCESSING',attempts=attempts+1
         FROM candidates c WHERE e.event_id=c.event_id RETURNING e.*`,
      ),
    );
    for (const event of events) {
      const body = JSON.stringify(event.payload);
      const signature = createSign('RSA-SHA256')
        .update(body)
        .end()
        .sign(privateKey.replace(/\\n/g, '\n'), 'base64');
      try {
        const response = await fetch(target, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'content-type': 'application/json',
            'x-falcon-event-id': event.event_id,
            'x-falcon-event-sequence': String(event.aggregate_sequence),
            'x-falcon-signature': `rsa-sha256=${signature}`,
          },
          body,
        });
        if (!response.ok)
          throw new Error(`Webhook returned ${response.status}`);
        await this.db.query(
          `UPDATE pv_outbox_events SET status='PUBLISHED',published_at=NOW(),last_error=NULL WHERE event_id=$1`,
          [event.event_id],
        );
      } catch (error) {
        await this.db.query(
          `UPDATE pv_outbox_events SET status='FAILED',last_error=$2,
             available_at=NOW()+(LEAST(attempts+1,10)||' minutes')::interval WHERE event_id=$1`,
          [
            event.event_id,
            error instanceof Error
              ? error.message.slice(0, 1000)
              : 'Publish failed',
          ],
        );
      }
    }
  }
}

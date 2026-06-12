import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LeadershipGateway } from './leadership.gateway';
import type { FeedEventPayload } from '../../common/constants/leadership-queue.constants';

export type EmitFeedParams = {
  tenantId: string;
  eventType: 'INCOME' | 'EXPENSE' | 'ALERT';
  label: string;
  amount?: number | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class FinancialFeedEmitter {
  private readonly logger = new Logger(FinancialFeedEmitter.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly gateway: LeadershipGateway,
  ) {}

  async emit(params: EmitFeedParams): Promise<FeedEventPayload> {
    const rows = await this.db.query(
      `INSERT INTO leadership_feed_events (tenant_id, event_type, label, amount, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING event_id, event_type, label, amount, metadata, created_at`,
      [
        params.tenantId,
        params.eventType,
        params.label,
        params.amount ?? null,
        JSON.stringify(params.metadata ?? {}),
      ],
    );
    const row = rows[0] as {
      event_id: string;
      event_type: 'INCOME' | 'EXPENSE' | 'ALERT';
      label: string;
      amount: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
    };

    const payload: FeedEventPayload = {
      event_id: row.event_id,
      event_type: row.event_type,
      label: row.label,
      amount: row.amount != null ? Number(row.amount) : null,
      metadata: row.metadata ?? {},
      created_at: row.created_at.toISOString(),
    };

    this.gateway.broadcastFeedEvent(params.tenantId, payload);
    return payload;
  }
}

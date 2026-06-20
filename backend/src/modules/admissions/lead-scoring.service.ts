import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

export const LEAD_SCORING_QUEUE = 'lead-scoring';

export type LeadScoreJob = { tenantId: string; leadId?: string };

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    @InjectQueue(LEAD_SCORING_QUEUE)
    private readonly queue: Queue<LeadScoreJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async enqueue(tenantId: string, leadId?: string) {
    await this.queue.add(
      'score',
      { tenantId, leadId },
      { removeOnComplete: true },
    );
  }

  async scoreLead(leadId: string) {
    const leadRows = await this.dataSource.query(
      `SELECT lead_id, stage, tenant_id FROM admissions_leads WHERE lead_id = $1`,
      [leadId],
    );
    const lead = leadRows[0];
    if (!lead) return { skipped: true };

    let score = 0;
    const stagePoints: Record<string, number> = {
      INQUIRY: 0,
      RAW_LEAD: 5,
      CONTACTED: 15,
      APPLICATION_STARTED: 40,
      APPLICATION_SUBMITTED: 40,
      FEE_PAID: 70,
      ENROLLED: 100,
      OFFERED: 60,
      LOST: 0,
    };
    score += stagePoints[String(lead.stage)] ?? 0;

    const activityRows = await this.dataSource.query(
      `SELECT channel, metadata FROM admissions_lead_activities WHERE lead_id = $1`,
      [leadId],
    );
    for (const row of activityRows) {
      if (row.channel === 'EMAIL' && row.metadata?.opened) score += 10;
      if (row.channel === 'SMS') score += 5;
      if (row.channel === 'WHATSAPP') score += 8;
      if (row.channel === 'APPLICATION') score += 50;
    }

    await this.dataSource.query(
      `UPDATE admissions_leads SET lead_score = $2, updated_at = NOW() WHERE lead_id = $1`,
      [leadId, score],
    );
    return { lead_id: leadId, lead_score: score };
  }

  async scoreAllForTenant(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT lead_id FROM admissions_leads WHERE tenant_id = $1 OR tenant_id IS NULL`,
      [tenantId],
    );
    for (const row of rows) {
      await this.scoreLead(row.lead_id);
    }
    return { scored: rows.length };
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async nightlyRescore() {
    const tenants = await this.dataSource.query(
      `SELECT tenant_id FROM tenants`,
    );
    for (const t of tenants) {
      await this.enqueue(t.tenant_id);
    }
    this.logger.log(`Queued lead scoring for ${tenants.length} tenant(s)`);
  }
}

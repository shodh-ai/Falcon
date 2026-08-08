import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';

@Injectable()
export class CompetitionsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listCompetitions(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM competitions WHERE tenant_id = $1 ORDER BY title`,
      [this.tenant(tenantId)],
    );
  }

  listEntries(tenantId?: string, competitionId?: string) {
    const tid = this.tenant(tenantId);
    if (competitionId) {
      return this.db.query(
        `SELECT * FROM competition_entries WHERE competition_id = $1 ORDER BY created_at DESC`,
        [competitionId],
      );
    }
    return this.db.query(
      `SELECT e.*, c.title AS competition_title, c.slug
       FROM competition_entries e
       JOIN competitions c ON c.competition_id = e.competition_id
       WHERE c.tenant_id = $1
       ORDER BY e.created_at DESC
       LIMIT 200`,
      [tid],
    );
  }

  async submitEntry(
    tenantId: string | undefined,
    userId: string,
    body: {
      competition_id: string;
      applicant_name?: string;
      applicant_email?: string;
      whitepaper_url?: string;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO competition_entries (
         competition_id, applicant_user_id, applicant_name, applicant_email,
         whitepaper_url, stage, status
       ) VALUES ($1, $2, $3, $4, $5, 'WHITEPAPER', 'SUBMITTED')
       RETURNING *`,
      [
        body.competition_id,
        userId,
        body.applicant_name ?? null,
        body.applicant_email ?? null,
        body.whitepaper_url ?? null,
      ],
    );
    return rows[0];
  }

  async advanceEntry(
    tenantId: string | undefined,
    entryId: string,
    stage: string,
    status?: string,
  ) {
    const rows = await this.db.query(
      `UPDATE competition_entries
       SET stage = $2, status = COALESCE($3, status)
       WHERE entry_id = $1
       RETURNING *`,
      [entryId, stage, status ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Entry not found');
    return rows[0];
  }

  async issueGoldenTicket(tenantId: string | undefined, entryId: string) {
    const tid = this.tenant(tenantId);
    const code = `GT-${randomBytes(4).toString('hex').toUpperCase()}`;
    const rows = await this.db.query(
      `UPDATE competition_entries
       SET stage = 'GOLDEN_TICKET', status = 'WINNER', golden_ticket_code = $2
       WHERE entry_id = $1
       RETURNING *`,
      [entryId, code],
    );
    if (!rows[0]) throw new NotFoundException('Entry not found');

    const entry = rows[0];
    try {
      const lead = await this.db.query(
        `INSERT INTO admissions_leads (
           tenant_id, full_name, email, phone, source, stage
         ) VALUES ($1, $2, $3, '0000000000', 'TOKAMAK_GOLDEN_TICKET', 'INQUIRY')
         RETURNING lead_id`,
        [
          tid,
          entry.applicant_name ?? 'Golden Ticket Winner',
          entry.applicant_email ?? `gt-${code.toLowerCase()}@tokamak.local`,
        ],
      );
      if (lead[0]?.lead_id) {
        await this.db.query(
          `UPDATE competition_entries SET admissions_lead_id = $2 WHERE entry_id = $1`,
          [entryId, lead[0].lead_id],
        );
      }
    } catch {
      // admissions_leads schema may differ — golden ticket code still issued
    }

    await this.db.query(
      `INSERT INTO tokamak_network_members (tenant_id, user_id, email, competition_entry_id)
       VALUES ($1, $2, $3, $4)`,
      [tid, entry.applicant_user_id, entry.applicant_email, entryId],
    );

    return { ...entry, golden_ticket_code: code };
  }

  funnelStats(tenantId?: string) {
    return this.db.query(
      `SELECT stage, status, COUNT(*)::int AS count
       FROM competition_entries e
       JOIN competitions c ON c.competition_id = e.competition_id
       WHERE c.tenant_id = $1
       GROUP BY stage, status
       ORDER BY stage`,
      [this.tenant(tenantId)],
    );
  }

  listChannels(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM tokamak_network_channels WHERE tenant_id = $1 ORDER BY name`,
      [this.tenant(tenantId)],
    );
  }

  listPosts(channelId: string) {
    return this.db.query(
      `SELECT p.*, u.name AS author_name
       FROM tokamak_network_posts p
       LEFT JOIN users u ON u.user_id = p.author_user_id
       WHERE p.channel_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [channelId],
    );
  }

  async createPost(
    userId: string,
    body: { channel_id: string; body: string },
  ) {
    if (!body.body?.trim()) throw new BadRequestException('body required');
    const rows = await this.db.query(
      `INSERT INTO tokamak_network_posts (channel_id, author_user_id, body)
       VALUES ($1, $2, $3) RETURNING *`,
      [body.channel_id, userId, body.body],
    );
    return rows[0];
  }

  listBounties(tenantId?: string) {
    return this.db.query(
      `SELECT b.*, u.name AS claimed_by_name
       FROM bounty_tasks b
       LEFT JOIN users u ON u.user_id = b.claimed_by
       WHERE b.tenant_id = $1
       ORDER BY b.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  /** TypeORM/pg can nest RETURNING rows; empty [] is truthy and must not pass validation. */
  private firstQueryRow<T extends { bounty_id?: string }>(rows: unknown): T | undefined {
    if (!Array.isArray(rows) || rows.length === 0) return undefined;
    const head = rows[0];
    const row = Array.isArray(head) ? head[0] : head;
    return row?.bounty_id ? (row as T) : undefined;
  }

  async claimBounty(tenantId: string | undefined, bountyId: string, userId: string) {
    const rows = await this.db.query(
      `UPDATE bounty_tasks
       SET status = 'CLAIMED', claimed_by = $3
       WHERE bounty_id = $1 AND tenant_id = $2 AND status = 'OPEN'
       RETURNING *`,
      [bountyId, this.tenant(tenantId), userId],
    );
    const row = this.firstQueryRow(rows);
    if (!row) throw new BadRequestException('Bounty not available');
    return row;
  }

  async markBountyPaid(tenantId: string | undefined, bountyId: string) {
    const rows = await this.db.query(
      `UPDATE bounty_tasks SET status = 'PAID'
       WHERE bounty_id = $1 AND tenant_id = $2 AND status = 'CLAIMED'
       RETURNING *`,
      [bountyId, this.tenant(tenantId)],
    );
    const row = this.firstQueryRow(rows);
    if (!row) throw new BadRequestException('Bounty must be claimed before marking paid');
    return row;
  }

  async reopenBounty(tenantId: string | undefined, bountyId: string) {
    const rows = await this.db.query(
      `UPDATE bounty_tasks
       SET status = 'OPEN', claimed_by = NULL
       WHERE bounty_id = $1 AND tenant_id = $2 AND status IN ('CLAIMED', 'PAID')
       RETURNING *`,
      [bountyId, this.tenant(tenantId)],
    );
    const row = this.firstQueryRow(rows);
    if (!row) throw new BadRequestException('Bounty is already open');
    return row;
  }
}

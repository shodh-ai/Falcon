import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { assertGrantSpendAllowed } from './grant-spend.util';

@Injectable()
export class ResearchService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listScholars(tenantId?: string) {
    return this.db.query(
      `SELECT rs.*, s.name AS scholar_name, g.name AS guide_name
       FROM research_scholars rs
       LEFT JOIN users s ON s.user_id = rs.student_user_id
       LEFT JOIN users g ON g.user_id = rs.guide_user_id
       WHERE rs.tenant_id = $1
       ORDER BY rs.updated_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  updatePhase(tenantId: string, scholarId: string, phase: string) {
    return this.db.query(
      `UPDATE research_scholars SET current_phase = $3, updated_at = NOW()
       WHERE scholar_id = $1 AND tenant_id = $2 RETURNING *`,
      [scholarId, this.tenant(tenantId), phase],
    );
  }

  listGrants(tenantId?: string) {
    return this.db.query(
      `SELECT rg.*, u.name AS pi_name,
              COALESCE(rg.available_amount, rg.sanctioned_amount - rg.utilized_amount) AS balance
       FROM research_grants rg
       LEFT JOIN users u ON u.user_id = rg.principal_investigator_id
       WHERE rg.tenant_id = $1 ORDER BY rg.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  utilizationCertificate(tenantId: string, grantId: string) {
    return this.db.query(
      `SELECT rg.grant_title, rg.funding_agency, rg.agency, rg.sanctioned_amount, rg.utilized_amount,
              rg.equipment_purchases, rg.available_amount, rg.allowed_expense_categories, rg.status,
              COALESCE(rg.available_amount, rg.sanctioned_amount - rg.utilized_amount) AS balance,
              COALESCE(SUM(e.amount), 0) AS expense_total
       FROM research_grants rg
       LEFT JOIN research_grant_expenses e ON e.grant_id = rg.grant_id
       WHERE rg.grant_id = $1 AND rg.tenant_id = $2
       GROUP BY rg.grant_id`,
      [grantId, this.tenant(tenantId)],
    );
  }

  listProposals(tenantId?: string, status?: string) {
    const tid = this.tenant(tenantId);
    if (status) {
      return this.db.query(
        `SELECT p.*, u.name AS pi_name
         FROM research_grant_proposals p
         LEFT JOIN users u ON u.user_id = p.pi_user_id
         WHERE p.tenant_id = $1 AND p.status = $2
         ORDER BY p.created_at DESC`,
        [tid, status],
      );
    }
    return this.db.query(
      `SELECT p.*, u.name AS pi_name
       FROM research_grant_proposals p
       LEFT JOIN users u ON u.user_id = p.pi_user_id
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC`,
      [tid],
    );
  }

  async createProposal(
    tenantId: string | undefined,
    piUserId: string,
    body: {
      title: string;
      agency?: string;
      requested_amount: number;
      abstract?: string;
      allowed_expense_categories?: string[];
    },
  ) {
    if (!body.title?.trim() || !(body.requested_amount > 0)) {
      throw new BadRequestException('title and requested_amount required');
    }
    const cats = body.allowed_expense_categories?.length
      ? body.allowed_expense_categories.map((c) => c.toUpperCase())
      : ['EQUIPMENT', 'CONSUMABLES', 'TRAVEL', 'MANPOWER', 'CONTINGENCY'];
    const rows = await this.db.query(
      `INSERT INTO research_grant_proposals (
         tenant_id, pi_user_id, title, agency, requested_amount, abstract,
         allowed_expense_categories, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT')
       RETURNING *`,
      [
        this.tenant(tenantId),
        piUserId,
        body.title.trim(),
        (body.agency || 'DST').toUpperCase(),
        body.requested_amount,
        body.abstract ?? null,
        cats,
      ],
    );
    return rows[0];
  }

  async submitProposal(
    tenantId: string | undefined,
    userId: string,
    proposalId: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `UPDATE research_grant_proposals
       SET status = 'PENDING_DOR', updated_at = NOW()
       WHERE proposal_id = $1 AND tenant_id = $2 AND pi_user_id = $3 AND status = 'DRAFT'
       RETURNING *`,
      [proposalId, tid, userId],
    );
    if (!rows[0]) {
      throw new BadRequestException({
        message: 'Proposal not found or not in DRAFT',
        code: 'PROPOSAL_NOT_DRAFT',
      });
    }
    return rows[0];
  }

  async decideProposal(
    tenantId: string | undefined,
    dorUserId: string,
    proposalId: string,
    body: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    const tid = this.tenant(tenantId);
    const props = await this.db.query(
      `SELECT * FROM research_grant_proposals WHERE proposal_id = $1 AND tenant_id = $2`,
      [proposalId, tid],
    );
    const p = props[0];
    if (!p) throw new NotFoundException('Proposal not found');
    if (p.status !== 'PENDING_DOR') {
      throw new BadRequestException({
        message: 'Proposal is not awaiting Dean of Research',
        code: 'WRONG_STATUS',
      });
    }
    if (body.decision === 'REJECTED') {
      const rows = await this.db.query(
        `UPDATE research_grant_proposals
         SET status = 'REJECTED', dor_notes = $3, decided_by = $4, decided_at = NOW(), updated_at = NOW()
         WHERE proposal_id = $1 AND tenant_id = $2
         RETURNING *`,
        [proposalId, tid, body.notes ?? null, dorUserId],
      );
      return rows[0];
    }

    const grant = await this.db.query(
      `INSERT INTO research_grants (
         tenant_id, principal_investigator_id, funding_agency, agency, grant_title,
         sanctioned_amount, utilized_amount, available_amount, status,
         allowed_expense_categories, dor_approved_by, dor_approved_at,
         proposal_abstract, start_date
       ) VALUES ($1,$2,$3,$3,$4,$5,0,$5,'ACTIVE',$6,$7,NOW(),$8,CURRENT_DATE)
       RETURNING *`,
      [
        tid,
        p.pi_user_id,
        p.agency,
        p.title,
        p.requested_amount,
        p.allowed_expense_categories,
        dorUserId,
        p.abstract,
      ],
    );

    const rows = await this.db.query(
      `UPDATE research_grant_proposals
       SET status = 'APPROVED', grant_id = $3, dor_notes = $4,
           decided_by = $5, decided_at = NOW(), updated_at = NOW()
       WHERE proposal_id = $1 AND tenant_id = $2
       RETURNING *`,
      [proposalId, tid, grant[0].grant_id, body.notes ?? null, dorUserId],
    );
    return { ...rows[0], grant: grant[0] };
  }

  listIp(tenantId?: string) {
    return this.db.query(
      `SELECT i.*, g.grant_title, u.name AS filed_by_name
       FROM research_ip_docket i
       LEFT JOIN research_grants g ON g.grant_id = i.grant_id
       LEFT JOIN users u ON u.user_id = i.filed_by
       WHERE i.tenant_id = $1
       ORDER BY i.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createIp(
    tenantId: string | undefined,
    userId: string,
    body: {
      title: string;
      ip_type?: string;
      inventors?: string;
      grant_id?: string;
      filing_ref?: string;
      notes?: string;
    },
  ) {
    if (!body.title?.trim()) throw new BadRequestException('title required');
    const rows = await this.db.query(
      `INSERT INTO research_ip_docket (
         tenant_id, title, ip_type, inventors, grant_id, filed_by, filing_ref, notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DISCLOSURE')
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.title.trim(),
        (body.ip_type || 'PATENT').toUpperCase(),
        body.inventors ?? null,
        body.grant_id ?? null,
        userId,
        body.filing_ref ?? null,
        body.notes ?? null,
      ],
    );
    return rows[0];
  }

  async assertGrantForSpend(
    tenantId: string | undefined,
    grantId: string,
    amount: number,
    expenseCategory: string,
  ) {
    const rows = await this.db.query(
      `SELECT * FROM research_grants WHERE grant_id = $1 AND tenant_id = $2`,
      [grantId, this.tenant(tenantId)],
    );
    if (!rows[0]) throw new NotFoundException('Grant not found');
    const g = rows[0];
    const check = assertGrantSpendAllowed({
      grantStatus: g.status,
      availableAmount: Number(
        g.available_amount ??
          Number(g.sanctioned_amount) - Number(g.utilized_amount),
      ),
      requestedAmount: amount,
      expenseCategory,
      allowedCategories: g.allowed_expense_categories || [],
    });
    if (!check.ok) {
      throw new BadRequestException({
        message: check.message,
        code: check.code,
      });
    }
    return g;
  }

  async debitGrantOnPay(
    tenantId: string | undefined,
    grantId: string,
    amount: number,
    expenseCategory: string,
    poId: string,
    description: string,
  ) {
    const tid = this.tenant(tenantId);
    await this.assertGrantForSpend(tid, grantId, amount, expenseCategory);
    await this.db.query(
      `UPDATE research_grants
       SET utilized_amount = utilized_amount + $2,
           available_amount = GREATEST(0, COALESCE(available_amount, sanctioned_amount - utilized_amount) - $2),
           equipment_purchases = equipment_purchases + CASE WHEN $3 = 'EQUIPMENT' THEN $2 ELSE 0 END
       WHERE grant_id = $1 AND tenant_id = $4`,
      [grantId, amount, expenseCategory.toUpperCase(), tid],
    );
    await this.db.query(
      `INSERT INTO research_grant_expenses (
         grant_id, expense_type, description, amount, expense_date, po_id, tenant_id
       ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6)`,
      [grantId, expenseCategory.toUpperCase(), description, amount, poId, tid],
    );
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendancePolicyService } from '../attendance-policy/attendance-policy.service';

@Injectable()
export class EcellUropService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly attendance: AttendancePolicyService,
  ) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async getIpAgreement(tenantId: string | undefined, projectId: string) {
    const rows = await this.db.query(
      `SELECT * FROM ecell_ip_agreements WHERE tenant_id = $1 AND project_id = $2`,
      [this.tenant(tenantId), projectId],
    );
    return rows[0] ?? null;
  }

  listIpAgreements(tenantId?: string) {
    return this.db.query(
      `SELECT a.*, p.startup_name, u.name AS inventor_name
       FROM ecell_ip_agreements a
       JOIN ecell_projects p ON p.project_id = a.project_id
       LEFT JOIN users u ON u.user_id = a.lead_inventor_user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async upsertIpAgreement(
    tenantId: string | undefined,
    body: {
      project_id: string;
      lead_inventor_user_id: string;
      university_equity_pct?: number;
      sgvu_pays_legal_fees?: boolean;
      reversion_years?: number;
      status?: string;
      signed_doc_url?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    const reversionYears = body.reversion_years ?? 3;
    const status = body.status ?? 'DRAFT';
    const rows = await this.db.query(
      `INSERT INTO ecell_ip_agreements (
         tenant_id, project_id, lead_inventor_user_id, university_equity_pct,
         sgvu_pays_legal_fees, reversion_years, reversion_at, status,
         signed_doc_url, signed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         CASE WHEN $7 = 'SIGNED' THEN NOW() + ($6 || ' years')::interval ELSE NULL END,
         $7, $8,
         CASE WHEN $7 = 'SIGNED' THEN NOW() ELSE NULL END
       )
       ON CONFLICT (tenant_id, project_id) DO UPDATE SET
         lead_inventor_user_id = EXCLUDED.lead_inventor_user_id,
         university_equity_pct = EXCLUDED.university_equity_pct,
         sgvu_pays_legal_fees = EXCLUDED.sgvu_pays_legal_fees,
         reversion_years = EXCLUDED.reversion_years,
         status = EXCLUDED.status,
         signed_doc_url = EXCLUDED.signed_doc_url,
         signed_at = EXCLUDED.signed_at,
         reversion_at = EXCLUDED.reversion_at
       RETURNING *`,
      [
        tid,
        body.project_id,
        body.lead_inventor_user_id,
        body.university_equity_pct ?? 5,
        body.sgvu_pays_legal_fees ?? true,
        reversionYears,
        status,
        body.signed_doc_url ?? null,
      ],
    );
    return rows[0];
  }

  async assertSignedIpBeforeFund(tenantId: string | undefined, projectId: string) {
    const agreement = await this.getIpAgreement(tenantId, projectId);
    if (!agreement || agreement.status !== 'SIGNED') {
      throw new BadRequestException(
        'Founder-First IP agreement must be SIGNED before funding',
      );
    }
    return agreement;
  }

  async listFellowships(tenantId?: string) {
    return this.db.query(
      `SELECT t.*, u.name AS student_name, u.official_email AS student_email
       FROM ecell_fellowship_trials t
       LEFT JOIN users u ON u.user_id = t.student_user_id
       WHERE t.tenant_id = $1
       ORDER BY t.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  listProductVivaPanelists(tenantId?: string, courseOfferingId?: string) {
    const tid = this.tenant(tenantId);
    if (courseOfferingId) {
      return this.db.query(
        `SELECT p.*, u.name AS panelist_name, u.official_email
         FROM product_viva_panelists p
         JOIN users u ON u.user_id = p.user_id
         WHERE p.tenant_id = $1 AND p.course_offering_id = $2
         ORDER BY p.panel_role, u.name`,
        [tid, courseOfferingId],
      );
    }
    return this.db.query(
      `SELECT p.*, u.name AS panelist_name, u.official_email
       FROM product_viva_panelists p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [tid],
    );
  }

  async addProductVivaPanelist(
    tenantId: string | undefined,
    body: {
      user_id: string;
      panel_role: 'VC' | 'INDUSTRY' | 'SHODH' | 'FACULTY';
      course_offering_id?: string;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO product_viva_panelists (tenant_id, course_offering_id, user_id, panel_role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.course_offering_id ?? null,
        body.user_id,
        body.panel_role,
      ],
    );
    return rows[0];
  }

  async applyFellowship(
    tenantId: string | undefined,
    studentUserId: string,
    body?: { linked_project_id?: string; paid_stipend_inr?: number },
  ) {
    const tid = this.tenant(tenantId);
    const existing = await this.db.query(
      `SELECT 1 FROM ecell_fellowship_trials
       WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'TRIAL'`,
      [tid, studentUserId],
    );
    if (existing[0]) {
      throw new BadRequestException('Active Hacker Filter trial already exists');
    }
    const rows = await this.db.query(
      `INSERT INTO ecell_fellowship_trials (
         tenant_id, student_user_id, program_code, linked_project_id,
         paid_stipend_inr, status
       ) VALUES ($1, $2, 'HACKER_FILTER', $3, $4, 'TRIAL')
       RETURNING *`,
      [
        tid,
        studentUserId,
        body?.linked_project_id ?? null,
        body?.paid_stipend_inr ?? 25000,
      ],
    );
    return rows[0];
  }

  async decideFellowship(
    tenantId: string | undefined,
    decidedBy: string,
    trialId: string,
    decision: 'PASSED' | 'FAILED' | 'CONVERTED',
    notes?: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `UPDATE ecell_fellowship_trials
       SET status = $3, notes = COALESCE($4, notes),
           decided_by = $5, decided_at = NOW()
       WHERE trial_id = $1 AND tenant_id = $2 AND status = 'TRIAL'
       RETURNING *`,
      [trialId, tid, decision, notes ?? null, decidedBy],
    );
    if (!rows[0]) throw new NotFoundException('Trial not found or already decided');

    if (decision === 'PASSED' || decision === 'CONVERTED') {
      await this.attendance.ensureEliteFellowWaiver(tid, rows[0].student_user_id);
    }
    return rows[0];
  }

  async listMentorsWithWranglers(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const wranglers = await this.db.query(
      `SELECT u.user_id, u.name, 'Wrangler' AS role_name,
              mp.org AS dept_name, 'Wrangler' AS mentor_type,
              COALESCE(mp.expertise_label, 'Industry Drill Sergeant') AS expertise_label,
              mp.mentor_tier, mp.is_industry_lead, mp.github_focus
       FROM ecell_mentor_profiles mp
       JOIN users u ON u.user_id = mp.user_id
       WHERE mp.tenant_id = $1 AND mp.mentor_tier = 'WRANGLER' AND u.is_active = true
       ORDER BY u.name`,
      [tid],
    );
    return wranglers;
  }
}

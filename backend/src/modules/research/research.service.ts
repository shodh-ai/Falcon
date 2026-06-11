import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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
      `SELECT rg.*, u.name AS pi_name
       FROM research_grants rg
       LEFT JOIN users u ON u.user_id = rg.principal_investigator_id
       WHERE rg.tenant_id = $1 ORDER BY rg.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  utilizationCertificate(tenantId: string, grantId: string) {
    return this.db.query(
      `SELECT rg.grant_title, rg.funding_agency, rg.sanctioned_amount, rg.utilized_amount,
              rg.equipment_purchases,
              (rg.sanctioned_amount - rg.utilized_amount) AS balance,
              COALESCE(SUM(e.amount), 0) AS expense_total
       FROM research_grants rg
       LEFT JOIN research_grant_expenses e ON e.grant_id = rg.grant_id
       WHERE rg.grant_id = $1 AND rg.tenant_id = $2
       GROUP BY rg.grant_id`,
      [grantId, this.tenant(tenantId)],
    );
  }
}

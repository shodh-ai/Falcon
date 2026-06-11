import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class CounselingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  getSeatMatrix(tenantId?: string, academicYear = '2026-27') {
    return this.db.query(
      `SELECT *, (total_seats - filled_seats) AS remaining_seats
       FROM admission_seat_matrix
       WHERE tenant_id = $1 AND academic_year = $2
       ORDER BY program_code`,
      [this.tenant(tenantId), academicYear],
    );
  }

  async allotSeat(tenantId: string, programCode: string, academicYear = '2026-27') {
    const rows = await this.db.query(
      `UPDATE admission_seat_matrix
       SET filled_seats = filled_seats + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND program_code = $2 AND academic_year = $3
         AND filled_seats < total_seats
       RETURNING *`,
      [this.tenant(tenantId), programCode, academicYear],
    );
    return rows[0] ?? null;
  }

  listMeritRanks(tenantId?: string, academicYear = '2026-27') {
    return this.db.query(
      `SELECT * FROM admission_merit_ranks
       WHERE tenant_id = $1 AND academic_year = $2
       ORDER BY merit_rank ASC LIMIT 500`,
      [this.tenant(tenantId), academicYear],
    );
  }

  async generateMeritList(
    tenantId: string,
    academicYear: string,
    rules: { sc_pct?: number; st_pct?: number; general_pct?: number },
  ) {
    const tid = this.tenant(tenantId);
    await this.db.query(
      `INSERT INTO admission_counseling_rules (tenant_id, academic_year, quota_sc_pct, quota_st_pct, quota_general_pct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [tid, academicYear, rules.sc_pct ?? 15, rules.st_pct ?? 15, rules.general_pct ?? 70],
    );
    return { message: 'Merit list generation queued', academic_year: academicYear, rules };
  }
}

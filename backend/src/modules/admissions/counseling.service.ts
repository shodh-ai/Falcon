import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';

@Injectable()
export class CounselingService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly campusScope: CampusScopeService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async getSeatMatrix(
    tenantId?: string,
    academicYear = '2026-27',
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) return [];
    if (!campusIds) {
      return this.db.query(
        `SELECT *, (total_seats - filled_seats) AS remaining_seats
         FROM admission_seat_matrix
         WHERE tenant_id = $1 AND academic_year = $2
         ORDER BY program_code`,
        [this.tenant(tenantId), academicYear],
      );
    }
    return this.db.query(
      `SELECT m.seat_id, m.program_code, m.program_name, m.total_seats, m.filled_seats,
              m.academic_year, m.updated_at,
              (m.total_seats - m.filled_seats) AS remaining_seats,
              s.school_name
       FROM admission_seat_matrix m
       JOIN iam_programs p
         ON upper(trim(p.program_code)) = upper(trim(m.program_code))
        AND p.deleted_at IS NULL
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       WHERE m.tenant_id = $1
         AND m.academic_year = $2
         AND s.campus_id = ANY($3::int[])
       ORDER BY m.program_name`,
      [this.tenant(tenantId), academicYear, campusIds],
    );
  }

  async allotSeat(
    tenantId: string,
    programCode: string,
    academicYear = '2026-27',
    actor?: ScopedAuthUser,
  ) {
    await this.campusScope.assertActorCampusAccess(
      actor,
      await this.campusScope.campusIdForProgramCode(programCode),
    );
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

  async listMeritRanks(
    tenantId?: string,
    academicYear = '2026-27',
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) return [];
    if (!campusIds) {
      return this.db.query(
        `SELECT * FROM admission_merit_ranks
         WHERE tenant_id = $1 AND academic_year = $2
         ORDER BY merit_rank ASC LIMIT 500`,
        [this.tenant(tenantId), academicYear],
      );
    }
    return this.db.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.rank_id) r.*
         FROM admission_merit_ranks r
         JOIN iam_programs p
           ON p.deleted_at IS NULL
          AND (
            upper(trim(p.program_code)) = upper(trim(r.program_preference))
            OR lower(trim(p.program_name)) = lower(trim(r.program_preference))
          )
         JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
         WHERE r.tenant_id = $1
           AND r.academic_year = $2
           AND s.campus_id = ANY($3::int[])
         ORDER BY r.rank_id, r.merit_rank ASC
       ) scoped
       ORDER BY scoped.merit_rank ASC
       LIMIT 500`,
      [this.tenant(tenantId), academicYear, campusIds],
    );
  }

  async generateMeritList(
    tenantId: string,
    academicYear: string,
    rules: { sc_pct?: number; st_pct?: number; general_pct?: number },
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds) {
      await this.campusScope.requireCampusIds(actor!);
      return {
        message: 'Merit list generation queued for assigned campus',
        academic_year: academicYear,
        campus_ids: campusIds,
        rules,
      };
    }

    const tid = this.tenant(tenantId);
    await this.db.query(
      `INSERT INTO admission_counseling_rules (tenant_id, academic_year, quota_sc_pct, quota_st_pct, quota_general_pct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        tid,
        academicYear,
        rules.sc_pct ?? 15,
        rules.st_pct ?? 15,
        rules.general_pct ?? 70,
      ],
    );
    return {
      message: 'Merit list generation queued',
      academic_year: academicYear,
      rules,
    };
  }
}

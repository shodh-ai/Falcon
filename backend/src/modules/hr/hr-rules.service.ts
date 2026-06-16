import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '../../core/redis/cache.service';

export type AttendanceRulesDto = {
  allowed_early_goings?: number;
  early_going_max_mins?: number;
  allowed_late_comings?: number;
  late_coming_max_mins?: number;
  penalty_on_exceed_type?: string;
  retroactive_penalty_days?: number;
};

@Injectable()
export class HrRulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  async getRules(tenantId: string, entityId: number) {
    const cacheKey = `hr_rules:${tenantId}:${entityId}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.dataSource.query(
          `SELECT * FROM hr_attendance_rules WHERE tenant_id = $1 AND entity_id = $2`,
          [tenantId, entityId],
        );
        if (!rows[0]) throw new NotFoundException('Attendance rules not configured for entity');
        return rows[0];
      },
      43_200,
    );
  }

  async upsertRules(
    tenantId: string,
    entityId: number,
    dto: AttendanceRulesDto,
    updatedByUserId: string,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_attendance_rules (
         tenant_id, entity_id, allowed_early_goings, early_going_max_mins,
         allowed_late_comings, late_coming_max_mins, penalty_on_exceed_type,
         retroactive_penalty_days, updated_by_user_id, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (tenant_id, entity_id) DO UPDATE SET
         allowed_early_goings = COALESCE(EXCLUDED.allowed_early_goings, hr_attendance_rules.allowed_early_goings),
         early_going_max_mins = COALESCE(EXCLUDED.early_going_max_mins, hr_attendance_rules.early_going_max_mins),
         allowed_late_comings = COALESCE(EXCLUDED.allowed_late_comings, hr_attendance_rules.allowed_late_comings),
         late_coming_max_mins = COALESCE(EXCLUDED.late_coming_max_mins, hr_attendance_rules.late_coming_max_mins),
         penalty_on_exceed_type = COALESCE(EXCLUDED.penalty_on_exceed_type, hr_attendance_rules.penalty_on_exceed_type),
         retroactive_penalty_days = COALESCE(EXCLUDED.retroactive_penalty_days, hr_attendance_rules.retroactive_penalty_days),
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        entityId,
        dto.allowed_early_goings ?? 3,
        dto.early_going_max_mins ?? 20,
        dto.allowed_late_comings ?? 3,
        dto.late_coming_max_mins ?? 15,
        dto.penalty_on_exceed_type ?? 'RETROACTIVE_HALF_DAY',
        dto.retroactive_penalty_days ?? 2.0,
        updatedByUserId,
      ],
    );
    return rows[0];
  }

  async listShifts(tenantId: string, entityId: number) {
    const cacheKey = `hr_shifts:${tenantId}:${entityId}`;
    return this.cache.getOrSet(cacheKey, () =>
      this.dataSource.query(
        `SELECT shift_id, shift_name, start_time::text, end_time::text, grace_period_mins,
                half_day_min_hours, full_day_min_hours, entity_id
         FROM hr_shifts
         WHERE entity_id = $1
         ORDER BY shift_name`,
        [entityId],
      ),
    );
  }

  async listShiftAllocations(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT a.*, s.shift_name, u.name AS user_name, d.dept_name AS department_name
       FROM hr_shift_allocations a
       JOIN hr_shifts s ON s.shift_id = a.shift_id
       LEFT JOIN users u ON u.user_id = a.user_id
       LEFT JOIN departments d ON d.dept_id = a.department_id
       WHERE a.tenant_id = $1 AND a.entity_id = $2
       ORDER BY a.effective_from DESC`,
      [tenantId, entityId],
    );
  }

  async upsertShiftAllocation(
    tenantId: string,
    entityId: number,
    dto: {
      shift_id: string;
      department_id?: number;
      user_id?: string;
      effective_from?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_shift_allocations (
         tenant_id, entity_id, shift_id, department_id, user_id, effective_from
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE))
       RETURNING *`,
      [
        tenantId,
        entityId,
        dto.shift_id,
        dto.department_id ?? null,
        dto.user_id ?? null,
        dto.effective_from ?? null,
      ],
    );
    return rows[0];
  }

  /** Batch-resolve shift context for many users in one round-trip (avoids N+1 in matrix views). */
  async getShiftsForUsers(tenantId: string, entityId: number, userIds: string[]) {
    if (!userIds.length) return new Map<string, Record<string, unknown>>();

    const rows = await this.dataSource.query<
      Array<{
        user_id: string;
        shift_id: string;
        shift_name: string;
        start_time: string;
        end_time: string;
        grace_period_mins: number;
        half_day_min_hours: number;
        full_day_min_hours: number;
        week_off_day: number;
      }>
    >(
      `SELECT ep.user_id, s.shift_id, s.shift_name, s.start_time::text, s.end_time::text,
              s.grace_period_mins, s.half_day_min_hours, s.full_day_min_hours,
              COALESCE(ep.week_off_day, 0) AS week_off_day
       FROM hr_employee_profiles ep
       JOIN users u ON u.user_id = ep.user_id
       LEFT JOIN hr_shift_allocations ua ON ua.user_id = ep.user_id
         AND ua.tenant_id = $1 AND ua.entity_id = $2
         AND ua.effective_from <= CURRENT_DATE
         AND (ua.effective_to IS NULL OR ua.effective_to >= CURRENT_DATE)
       LEFT JOIN hr_shift_allocations dept_alloc ON dept_alloc.department_id = u.dept_id
         AND dept_alloc.tenant_id = $1 AND dept_alloc.entity_id = $2
         AND dept_alloc.effective_from <= CURRENT_DATE
         AND (dept_alloc.effective_to IS NULL OR dept_alloc.effective_to >= CURRENT_DATE)
       LEFT JOIN hr_shifts s ON s.shift_id = COALESCE(ua.shift_id, dept_alloc.shift_id, ep.shift_id)
       WHERE ep.tenant_id = $1 AND ep.user_id = ANY($3::uuid[])`,
      [tenantId, entityId, userIds],
    );

    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.shift_id) map.set(row.user_id, row);
    }

    const missing = userIds.filter((id) => !map.has(id));
    if (missing.length) {
      const fallback = await this.dataSource.query(
        `SELECT shift_id, shift_name, start_time::text, end_time::text,
                grace_period_mins, half_day_min_hours, full_day_min_hours, 0 AS week_off_day
         FROM hr_shifts WHERE entity_id = $1 ORDER BY shift_name LIMIT 1`,
        [entityId],
      );
      if (fallback[0]) {
        for (const userId of missing) map.set(userId, { ...fallback[0], user_id: userId });
      }
    }

    return map;
  }

  async getShiftForUser(tenantId: string, entityId: number, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT s.shift_id, s.shift_name, s.start_time::text, s.end_time::text,
              s.grace_period_mins, s.half_day_min_hours, s.full_day_min_hours,
              COALESCE(ep.week_off_day, 0) AS week_off_day
       FROM hr_employee_profiles ep
       JOIN users u ON u.user_id = ep.user_id
       LEFT JOIN hr_shift_allocations ua ON ua.user_id = ep.user_id
         AND ua.tenant_id = $1 AND ua.entity_id = $2
         AND ua.effective_from <= CURRENT_DATE
         AND (ua.effective_to IS NULL OR ua.effective_to >= CURRENT_DATE)
       LEFT JOIN hr_shift_allocations dept_alloc ON dept_alloc.department_id = u.dept_id
         AND dept_alloc.tenant_id = $1 AND dept_alloc.entity_id = $2
         AND dept_alloc.effective_from <= CURRENT_DATE
         AND (dept_alloc.effective_to IS NULL OR dept_alloc.effective_to >= CURRENT_DATE)
       LEFT JOIN hr_shifts s ON s.shift_id = COALESCE(ua.shift_id, dept_alloc.shift_id, ep.shift_id)
       WHERE ep.user_id = $3 AND ep.tenant_id = $1
       LIMIT 1`,
      [tenantId, entityId, userId],
    );

    if (rows[0]?.shift_id) return rows[0];

    const fallback = await this.dataSource.query(
      `SELECT shift_id, shift_name, start_time::text, end_time::text,
              grace_period_mins, half_day_min_hours, full_day_min_hours, 0 AS week_off_day
       FROM hr_shifts WHERE entity_id = $1 ORDER BY shift_name LIMIT 1`,
      [entityId],
    );
    return fallback[0] ?? null;
  }

  async incrementEarlyGoing(
    tenantId: string,
    entityId: number,
    userId: string,
    monthYear: string,
    date: string,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_penalty_trackers (
         tenant_id, entity_id, user_id, month_year, early_goings_count, penalty_dates, updated_at
       ) VALUES ($1,$2,$3,$4,1, $5::jsonb, NOW())
       ON CONFLICT (tenant_id, entity_id, user_id, month_year) DO UPDATE SET
         early_goings_count = hr_penalty_trackers.early_goings_count + 1,
         penalty_dates = hr_penalty_trackers.penalty_dates || $5::jsonb,
         updated_at = NOW()
       RETURNING *`,
      [tenantId, entityId, userId, monthYear, JSON.stringify([{ type: 'EARLY_GOING', date }])],
    );
    return rows[0];
  }

  async recordPayrollDeduction(
    tenantId: string,
    entityId: number,
    userId: string,
    monthYear: string,
    deductionType: string,
    amount: number,
    daysDeducted: number,
    reason: string,
  ) {
    await this.dataSource.query(
      `INSERT INTO hr_payroll_deductions (
         tenant_id, entity_id, user_id, month_year, deduction_type,
         amount, days_deducted, reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, entityId, userId, monthYear, deductionType, amount, daysDeducted, reason],
    );
  }
}

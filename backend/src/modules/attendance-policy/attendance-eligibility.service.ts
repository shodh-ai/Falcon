import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const DEFAULT_MIN_ATTENDANCE = 75;

export interface AttendanceEligibility {
  attendance_percent: number;
  effective_threshold: number;
  threshold_source: 'DEFAULT' | 'POLICY' | 'EXEMPTION';
  exemption_id: string | null;
  eligible: boolean;
  reason: string | null;
}

/**
 * Single source of truth for "is this student attendance-eligible for exams".
 * Resolves the department's effective threshold (default 75%, relaxed by an
 * approved HOD/Dean policy change) and honours individual approved exemptions.
 */
@Injectable()
export class AttendanceEligibilityService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async computeAttendancePercent(studentUserId: string): Promise<number> {
    const enrollment = await this.db.query(
      `SELECT AVG(attendance_percent)::float AS pct
       FROM student_course_enrollments
       WHERE student_user_id = $1 AND attendance_percent IS NOT NULL`,
      [studentUserId],
    );
    if (enrollment[0]?.pct != null) {
      return Math.round(Number(enrollment[0].pct));
    }

    const raw = await this.db
      .query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE'))::float AS attended,
                COUNT(*)::float AS total
         FROM academic_attendance_records WHERE student_user_id = $1`,
        [studentUserId],
      )
      .catch(() => [] as Array<{ attended: number; total: number }>);
    const total = Number(raw[0]?.total ?? 0);
    return total > 0 ? Math.round((Number(raw[0]?.attended ?? 0) / total) * 100) : 0;
  }

  /** Effective minimum attendance for a student's department (approved policy or default). */
  async resolveThreshold(
    tenantId: string,
    deptId: number | null | undefined,
  ): Promise<{ threshold: number; source: 'DEFAULT' | 'POLICY' }> {
    const rows = await this.db
      .query(
        `SELECT requested_min_percent, dept_id
         FROM attendance_threshold_requests
         WHERE tenant_id = $1 AND status = 'APPROVED'
           AND (dept_id = $2 OR dept_id IS NULL)
         ORDER BY (dept_id IS NOT NULL) DESC, decided_at DESC
         LIMIT 1`,
        [tenantId, deptId ?? null],
      )
      .catch(() => [] as Array<{ requested_min_percent: number }>);
    if (rows[0]?.requested_min_percent != null) {
      return { threshold: Number(rows[0].requested_min_percent), source: 'POLICY' };
    }
    return { threshold: DEFAULT_MIN_ATTENDANCE, source: 'DEFAULT' };
  }

  private async findActiveExemption(
    tenantId: string,
    studentUserId: string,
  ): Promise<string | null> {
    const rows = await this.db
      .query(
        `SELECT exemption_id FROM student_attendance_exemptions
         WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'APPROVED'
         ORDER BY final_decided_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [tenantId, studentUserId],
      )
      .catch(() => [] as Array<{ exemption_id: string }>);
    return rows[0]?.exemption_id ?? null;
  }

  /** Evaluate attendance eligibility and (optionally) write an audit row. */
  async evaluate(
    tenantId: string,
    studentUserId: string,
    options: { deptId?: number | null; context?: string; audit?: boolean } = {},
  ): Promise<AttendanceEligibility> {
    let deptId = options.deptId ?? null;
    if (deptId == null) {
      const u = await this.db
        .query(`SELECT dept_id FROM users WHERE user_id = $1`, [studentUserId])
        .catch(() => [] as Array<{ dept_id: number | null }>);
      deptId = u[0]?.dept_id ?? null;
    }

    const [attendance, { threshold, source }] = await Promise.all([
      this.computeAttendancePercent(studentUserId),
      this.resolveThreshold(tenantId, deptId),
    ]);

    let eligible = attendance >= threshold;
    let exemptionId: string | null = null;
    let resolvedSource: AttendanceEligibility['threshold_source'] = source;
    let reason: string | null = null;

    if (!eligible) {
      exemptionId = await this.findActiveExemption(tenantId, studentUserId);
      if (exemptionId) {
        eligible = true;
        resolvedSource = 'EXEMPTION';
      } else {
        reason = `Blocked: Attendance ${attendance}% (min ${threshold}%)`;
      }
    }

    if (options.audit) {
      await this.db
        .query(
          `INSERT INTO attendance_eligibility_audit
             (tenant_id, student_user_id, attendance_percent, effective_threshold,
              threshold_source, exemption_id, eligible, reason, context)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            tenantId,
            studentUserId,
            attendance,
            threshold,
            resolvedSource,
            exemptionId,
            eligible,
            reason,
            options.context ?? 'ADMIT_CARD',
          ],
        )
        .catch(() => undefined);
    }

    return {
      attendance_percent: attendance,
      effective_threshold: threshold,
      threshold_source: resolvedSource,
      exemption_id: exemptionId,
      eligible,
      reason,
    };
  }
}

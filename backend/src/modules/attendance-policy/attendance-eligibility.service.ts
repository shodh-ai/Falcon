import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';

export const DEFAULT_MIN_ATTENDANCE = 75;

export interface AttendanceEligibility {
  attendance_percent: number;
  effective_threshold: number;
  threshold_source: 'DEFAULT' | 'POLICY' | 'EXEMPTION';
  exemption_id: string | null;
  eligible: boolean;
  reason: string | null;
}

export interface AttendanceEligibilityOptions {
  deptId?: number | null;
  context?: string;
  audit?: boolean;
  /** Exam operations opt in to complete, tenant-scoped source validation. */
  strict?: boolean;
  semester?: number;
  courseIds?: string[];
  manager?: EntityManager;
}

type AttendanceEnrollment = {
  course_id?: string;
  attendance_percent: string | number | null;
  course_code: string;
  min_attendance: number | null;
};

type AttendanceQueryOptions = Pick<
  AttendanceEligibilityOptions,
  'strict' | 'semester' | 'manager'
>;

/**
 * Single source of truth for "is this student attendance-eligible for exams".
 * Resolves the department's effective threshold (default 75%, relaxed by an
 * approved HOD/Dean policy change) and honours HOD-approved individual exemptions.
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
    return total > 0
      ? Math.round((Number(raw[0]?.attended ?? 0) / total) * 100)
      : 0;
  }

  /** Effective minimum attendance for a student's department (approved policy or default). */
  async resolveThreshold(
    tenantId: string,
    deptId: number | null | undefined,
    options: AttendanceQueryOptions = {},
  ): Promise<{ threshold: number; source: 'DEFAULT' | 'POLICY' }> {
    const rows = await (options.manager ?? this.db)
      .query(
        `SELECT requested_min_percent, dept_id
         FROM attendance_threshold_requests
         WHERE tenant_id = $1 AND status = 'APPROVED'
           AND (dept_id = $2 OR dept_id IS NULL)
         ORDER BY (dept_id IS NOT NULL) DESC, decided_at DESC
         LIMIT 1`,
        [tenantId, deptId ?? null],
      )
      .catch((error: unknown) => {
        if (options.strict) throw error;
        return [] as Array<{ requested_min_percent: number }>;
      });
    if (rows[0]?.requested_min_percent != null) {
      if (
        options.strict &&
        (!Number.isFinite(Number(rows[0].requested_min_percent)) ||
          Number(rows[0].requested_min_percent) < 1 ||
          Number(rows[0].requested_min_percent) > 100)
      ) {
        throw new BadRequestException('Approved attendance policy is invalid');
      }
      return {
        threshold: Number(rows[0].requested_min_percent),
        source: 'POLICY',
      };
    }
    return { threshold: DEFAULT_MIN_ATTENDANCE, source: 'DEFAULT' };
  }

  private async findActiveExemption(
    tenantId: string,
    studentUserId: string,
    options: AttendanceQueryOptions = {},
  ): Promise<string | null> {
    const rows = await (options.manager ?? this.db)
      .query(
        `SELECT exemption_id FROM student_attendance_exemptions
         WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'APPROVED'
         ${options.strict ? 'AND (semester IS NULL OR semester = $3)' : ''}
         ORDER BY hod_decided_at DESC NULLS LAST, final_decided_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        options.strict
          ? [tenantId, studentUserId, options.semester]
          : [tenantId, studentUserId],
      )
      .catch((error: unknown) => {
        if (options.strict) throw error;
        return [] as Array<{ exemption_id: string }>;
      });
    return rows[0]?.exemption_id ?? null;
  }

  /** Evaluate attendance eligibility and (optionally) write an audit row. */
  async evaluate(
    tenantId: string,
    studentUserId: string,
    options: AttendanceEligibilityOptions = {},
  ): Promise<AttendanceEligibility> {
    let deptId = options.deptId ?? null;
    let strictEnrollments: AttendanceEnrollment[] | undefined;
    if (options.strict) {
      this.validateStrictScope(tenantId, studentUserId, options);
      const query = options.manager ?? this.db;
      const students = await query.query<Array<{ dept_id: number | null }>>(
        `SELECT u.dept_id FROM users u
         WHERE u.user_id = $1 AND u.tenant_id = $2
           AND u.is_active = true AND u.deleted_at IS NULL
           AND (EXISTS (
             SELECT 1 FROM roles r WHERE r.role_id = u.role_id
               AND r.role_name = 'Student' AND r.deleted_at IS NULL
           ) OR EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = u.user_id AND ur.deleted_at IS NULL
               AND r.role_name = 'Student' AND r.deleted_at IS NULL
           ))`,
        [studentUserId, tenantId],
      );
      if (!students[0]) {
        return {
          attendance_percent: 0,
          effective_threshold: DEFAULT_MIN_ATTENDANCE,
          threshold_source: 'DEFAULT',
          exemption_id: null,
          eligible: false,
          reason:
            'Blocked: Active student record is unavailable in this tenant',
        };
      }
      // Caller-supplied department information must not select a different policy.
      deptId = students[0].dept_id;
      strictEnrollments = await query.query<AttendanceEnrollment[]>(
        `SELECT e.course_id, e.attendance_percent, c.course_code, c.min_attendance
         FROM student_course_enrollments e
         JOIN academic_courses c ON c.course_id = e.course_id
           AND c.tenant_id = $1 AND c.deleted_at IS NULL
         WHERE e.tenant_id = $1 AND e.student_user_id = $2
           AND e.semester = $3 AND e.course_id = ANY($4::uuid[])
           AND e.status = 'ENROLLED' AND e.deleted_at IS NULL
         ORDER BY e.course_id`,
        [
          tenantId,
          studentUserId,
          options.semester,
          options.courseIds!.map((courseId) => courseId.toLowerCase()),
        ],
      );
    } else if (deptId == null) {
      const u = await this.db
        .query(`SELECT dept_id FROM users WHERE user_id = $1`, [studentUserId])
        .catch(() => [] as Array<{ dept_id: number | null }>);
      deptId = u[0]?.dept_id ?? null;
    }

    const [attendance, { threshold, source }] = await Promise.all([
      strictEnrollments
        ? Promise.resolve(this.strictAttendancePercent(strictEnrollments))
        : this.computeAttendancePercent(studentUserId),
      this.resolveThreshold(tenantId, deptId, options),
    ]);

    const enrollments =
      strictEnrollments ??
      (await this.db
        .query(
          `SELECT e.attendance_percent, c.course_code, c.min_attendance
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.attendance_percent IS NOT NULL`,
          [studentUserId],
        )
        .catch(() => []));

    const incomplete: string[] = [];
    if (options.strict) {
      const expected = new Set(
        options.courseIds!.map((courseId) => courseId.toLowerCase()),
      );
      const actual = new Set(
        enrollments.map((e: AttendanceEnrollment) => e.course_id),
      );
      if (
        enrollments.length !== expected.size ||
        actual.size !== expected.size ||
        [...expected].some((courseId) => !actual.has(courseId))
      ) {
        incomplete.push(
          'Active enrollment is missing or inconsistent for the requested semester and subjects',
        );
      }
    }
    const shortfalls: string[] = [];
    for (const e of enrollments) {
      const courseMin =
        e.min_attendance != null ? Number(e.min_attendance) : threshold;
      const att = Number(e.attendance_percent);
      if (options.strict) {
        if (
          e.attendance_percent == null ||
          !Number.isFinite(att) ||
          att < 0 ||
          att > 100
        ) {
          incomplete.push(
            `Attendance data is unavailable or invalid for ${e.course_code}`,
          );
          continue;
        }
        if (!Number.isFinite(courseMin) || courseMin < 0 || courseMin > 100) {
          incomplete.push(`Attendance rule is invalid for ${e.course_code}`);
          continue;
        }
      }
      if (att < courseMin) {
        shortfalls.push(
          `${e.course_code} (${Math.round(att)}% < ${courseMin}%)`,
        );
      }
    }

    let eligible = incomplete.length === 0 && shortfalls.length === 0;
    let exemptionId: string | null = null;
    let resolvedSource: AttendanceEligibility['threshold_source'] = source;
    let reason: string | null = incomplete.length
      ? `Blocked: ${incomplete.join('; ')}`
      : null;

    if (!eligible && incomplete.length === 0) {
      exemptionId = await this.findActiveExemption(
        tenantId,
        studentUserId,
        options,
      );
      if (exemptionId) {
        eligible = true;
        resolvedSource = 'EXEMPTION';
      } else {
        reason = `Blocked: Shortfall in ${shortfalls.join(', ')}`;
      }
    }

    if (options.audit) {
      await (options.manager ?? this.db)
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
        .catch((error: unknown) => {
          if (options.strict) throw error;
          return undefined;
        });
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

  private validateStrictScope(
    tenantId: string,
    studentUserId: string,
    options: AttendanceEligibilityOptions,
  ): void {
    if (!isUUID(tenantId) || !isUUID(studentUserId)) {
      throw new BadRequestException(
        'Valid tenant and student IDs are required for attendance verification',
      );
    }
    if (
      !Number.isSafeInteger(options.semester) ||
      Number(options.semester) <= 0
    ) {
      throw new BadRequestException(
        'A positive semester is required for attendance verification',
      );
    }
    if (
      !Array.isArray(options.courseIds) ||
      options.courseIds.length === 0 ||
      options.courseIds.some((courseId) => !isUUID(courseId)) ||
      new Set(options.courseIds.map((courseId) => courseId.toLowerCase()))
        .size !== options.courseIds.length
    ) {
      throw new BadRequestException(
        'Unique enrolled course IDs are required for attendance verification',
      );
    }
  }

  private strictAttendancePercent(enrollments: AttendanceEnrollment[]): number {
    const percentages = enrollments
      .filter((enrollment) => enrollment.attendance_percent != null)
      .map((enrollment) => Number(enrollment.attendance_percent))
      .filter(
        (percentage) =>
          Number.isFinite(percentage) && percentage >= 0 && percentage <= 100,
      );
    return percentages.length
      ? Math.round(
          percentages.reduce((sum, percentage) => sum + percentage, 0) /
            percentages.length,
        )
      : 0;
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import type { DemeritCategory, ReviewDemeritIncidentDto, SubmitDemeritIncidentDto } from './dto/demerits.dto';

const SUBJECT_BACK_THRESHOLD = 6;

type IncidentRow = {
  incident_id: string;
  tenant_id: string;
  student_user_id: string;
  course_id: string;
  faculty_user_id: string;
  category: string;
  points: number;
  description: string;
  evidence_urls: string[] | null;
  status: string;
  dc_reviewer_id: string | null;
  dc_committee_remarks: string | null;
  subject_back_applied_at: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class DemeritsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async getFormOptions(tenantId: string, facultyUserId?: string) {
    const [students, courses] = await Promise.all([
      this.db.query(
        `SELECT u.user_id, u.name, u.official_email,
                COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = 'Student'
         ORDER BY u.name
         LIMIT 500`,
        [tenantId],
      ),
      facultyUserId
        ? this.db.query(
            `SELECT DISTINCT c.course_id, c.course_code, c.course_name
             FROM academic_courses c
             JOIN faculty_course_assignments fca ON fca.course_id = c.course_id
             WHERE c.tenant_id = $1 AND fca.faculty_user_id = $2
             ORDER BY c.course_code
             LIMIT 200`,
            [tenantId, facultyUserId],
          ).catch(() =>
            this.db.query(
              `SELECT course_id, course_code, course_name FROM academic_courses
               WHERE tenant_id = $1 ORDER BY course_code LIMIT 200`,
              [tenantId],
            ),
          )
        : this.db.query(
            `SELECT course_id, course_code, course_name FROM academic_courses
             WHERE tenant_id = $1 ORDER BY course_code LIMIT 200`,
            [tenantId],
          ),
    ]);
    return { students, courses, categories: ['PLAGIARISM', 'BEHAVIORAL', 'ATTENDANCE', 'EXAM_MALPRACTICE'] };
  }

  async submitIncident(tenantId: string, facultyUserId: string, dto: SubmitDemeritIncidentDto) {
    const studentUserId = await this.resolveStudentUserId(tenantId, dto.student_id.trim());
    const courseId = await this.resolveCourseId(tenantId, dto.subject_id.trim());

    const rows = await this.db.query<IncidentRow[]>(
      `INSERT INTO demerit_incidents (
         tenant_id, student_user_id, course_id, faculty_user_id,
         category, points, description, evidence_urls, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'PENDING_DC_REVIEW')
       RETURNING *`,
      [
        tenantId,
        studentUserId,
        courseId,
        facultyUserId,
        dto.category,
        dto.points,
        dto.description.trim(),
        JSON.stringify(dto.evidence_urls ?? []),
      ],
    );
    return this.enrichIncident(rows[0]);
  }

  listFacultyHistory(tenantId: string, facultyUserId: string) {
    return this.listIncidents(tenantId, {
      facultyUserId,
      orderBy: 'created_at DESC',
    });
  }

  listPending(tenantId: string) {
    return this.listIncidents(tenantId, {
      status: 'PENDING_DC_REVIEW',
      orderBy: 'created_at ASC',
    });
  }

  async getDashboard(tenantId: string) {
    const [[pending], [approvedMonth], [rejectedMonth], [subjectBack]] = await Promise.all([
      this.db.query<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM demerit_incidents WHERE tenant_id = $1 AND status = 'PENDING_DC_REVIEW'`,
        [tenantId],
      ),
      this.db.query<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM demerit_incidents
         WHERE tenant_id = $1 AND status = 'APPROVED_BY_DC'
           AND updated_at >= date_trunc('month', NOW())`,
        [tenantId],
      ),
      this.db.query<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM demerit_incidents
         WHERE tenant_id = $1 AND status = 'REJECTED_BY_DC'
           AND updated_at >= date_trunc('month', NOW())`,
        [tenantId],
      ),
      this.db.query<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM student_academic_summaries
         WHERE tenant_id = $1 AND is_subject_back_triggered = true`,
        [tenantId],
      ),
    ]);
    return {
      pending_review: pending?.c ?? 0,
      approved_this_month: approvedMonth?.c ?? 0,
      rejected_this_month: rejectedMonth?.c ?? 0,
      subject_back_students: subjectBack?.c ?? 0,
    };
  }

  async reviewIncident(
    tenantId: string,
    incidentId: string,
    reviewerUserId: string,
    dto: ReviewDemeritIncidentDto,
  ) {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const locked = (await qr.query(
        `SELECT * FROM demerit_incidents
         WHERE incident_id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [incidentId, tenantId],
      )) as IncidentRow[];
      const incident = locked[0];
      if (!incident) throw new NotFoundException('Incident not found');
      if (incident.status !== 'PENDING_DC_REVIEW') {
        throw new BadRequestException('Incident has already been reviewed');
      }

      if (dto.status === 'REJECTED_BY_DC') {
        await qr.query(
          `UPDATE demerit_incidents
           SET status = 'REJECTED_BY_DC',
               dc_reviewer_id = $3,
               dc_committee_remarks = $4,
               updated_at = NOW()
           WHERE incident_id = $1 AND tenant_id = $2`,
          [incidentId, tenantId, reviewerUserId, dto.dc_committee_remarks.trim()],
        );
        await qr.commitTransaction();
        return this.enrichIncident(
          (
            await this.db.query<IncidentRow[]>(
              `SELECT * FROM demerit_incidents WHERE incident_id = $1`,
              [incidentId],
            )
          )[0],
        );
      }

      await qr.query(
        `UPDATE demerit_incidents
         SET status = 'APPROVED_BY_DC',
             dc_reviewer_id = $3,
             dc_committee_remarks = $4,
             updated_at = NOW()
         WHERE incident_id = $1 AND tenant_id = $2`,
        [incidentId, tenantId, reviewerUserId, dto.dc_committee_remarks.trim()],
      );

      const summary = await this.ensureSummaryLocked(qr, tenantId, incident.student_user_id);
      const newTotal = Number(summary.cumulative_demerit_points) + Number(incident.points);
      const subjectBack = newTotal >= SUBJECT_BACK_THRESHOLD;

      await qr.query(
        `UPDATE student_academic_summaries
         SET cumulative_demerit_points = $3,
             is_subject_back_triggered = CASE WHEN $4 THEN TRUE ELSE is_subject_back_triggered END,
             subject_back_course_id = CASE WHEN $4 THEN $5 ELSE subject_back_course_id END,
             subject_back_triggered_at = CASE WHEN $4 AND subject_back_triggered_at IS NULL THEN NOW() ELSE subject_back_triggered_at END,
             updated_at = NOW()
         WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, incident.student_user_id, newTotal, subjectBack, incident.course_id],
      );

      if (subjectBack) {
        await this.applySubjectBack(qr, tenantId, incident, dto.dc_committee_remarks.trim());
      }

      await qr.commitTransaction();
      const updated = (
        await this.db.query<IncidentRow[]>(`SELECT * FROM demerit_incidents WHERE incident_id = $1`, [
          incidentId,
        ])
      )[0];
      return this.enrichIncident(updated);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  listApprovedForStudent(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT di.incident_id, di.category, di.points, di.description, di.dc_committee_remarks,
              di.status, di.created_at, di.updated_at,
              c.course_code, c.course_name
       FROM demerit_incidents di
       JOIN academic_courses c ON c.course_id = di.course_id
       WHERE di.tenant_id = $1 AND di.student_user_id = $2 AND di.status = 'APPROVED_BY_DC'
       ORDER BY di.updated_at DESC`,
      [tenantId, studentUserId],
    );
  }

  getStudentSummary(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT cumulative_demerit_points, is_subject_back_triggered, subject_back_triggered_at
       FROM student_academic_summaries
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, studentUserId],
    ).then((rows) => rows[0] ?? { cumulative_demerit_points: 0, is_subject_back_triggered: false });
  }

  private async applySubjectBack(
    qr: QueryRunner,
    tenantId: string,
    incident: IncidentRow,
    remarks: string,
  ) {
    await qr.query(
      `UPDATE demerit_incidents SET subject_back_applied_at = NOW(), updated_at = NOW()
       WHERE incident_id = $1`,
      [incident.incident_id],
    );

    if (await this.tableExists(qr, 'student_course_enrollments')) {
      await qr.query(
        `UPDATE student_course_enrollments
         SET status = 'FAILED', grade = 'F', grade_points = 0, updated_at = NOW()
         WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3`,
        [tenantId, incident.student_user_id, incident.course_id],
      ).catch(() => undefined);
    }

    if (await this.tableExists(qr, 'student_discipline_records')) {
      await qr.query(
        `INSERT INTO student_discipline_records (
           tenant_id, student_user_id, incident_type, description, action_taken, date_logged
         ) VALUES ($1,$2,'SUBJECT_BACK',$3,$4,CURRENT_DATE)`,
        [
          tenantId,
          incident.student_user_id,
          `Automatic Subject Back — cumulative demerit points reached ${SUBJECT_BACK_THRESHOLD}.`,
          `Subject Back applied for approved demerit incident. DC remarks: ${remarks}`,
        ],
      ).catch(() => undefined);
    }
  }

  private async ensureSummaryLocked(qr: QueryRunner, tenantId: string, studentUserId: string) {
    await qr.query(
      `INSERT INTO student_academic_summaries (tenant_id, student_user_id)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, student_user_id) DO NOTHING`,
      [tenantId, studentUserId],
    );
    const rows = (await qr.query(
      `SELECT cumulative_demerit_points, is_subject_back_triggered
       FROM student_academic_summaries
       WHERE tenant_id = $1 AND student_user_id = $2
       FOR UPDATE`,
      [tenantId, studentUserId],
    )) as Array<{ cumulative_demerit_points: number; is_subject_back_triggered: boolean }>;
    return rows[0];
  }

  private async listIncidents(
    tenantId: string,
    opts: { status?: string; facultyUserId?: string; orderBy?: string },
  ) {
    const params: unknown[] = [tenantId];
    const filters = ['di.tenant_id = $1'];
    if (opts.status) {
      params.push(opts.status);
      filters.push(`di.status = $${params.length}`);
    }
    if (opts.facultyUserId) {
      params.push(opts.facultyUserId);
      filters.push(`di.faculty_user_id = $${params.length}`);
    }
    const order = opts.orderBy ?? 'di.created_at DESC';
    const rows = await this.db.query<IncidentRow[]>(
      `SELECT di.*,
              su.name AS student_name,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number,
              fu.name AS faculty_name,
              c.course_code, c.course_name,
              d.dept_name AS department_name,
              COALESCE(sas.cumulative_demerit_points, 0) AS current_demerit_points,
              COALESCE(sas.is_subject_back_triggered, false) AS is_subject_back_triggered
       FROM demerit_incidents di
       JOIN users su ON su.user_id = di.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = di.student_user_id
       JOIN users fu ON fu.user_id = di.faculty_user_id
       JOIN academic_courses c ON c.course_id = di.course_id
       LEFT JOIN departments d ON d.dept_id = su.dept_id
       LEFT JOIN student_academic_summaries sas
         ON sas.tenant_id = di.tenant_id AND sas.student_user_id = di.student_user_id
       WHERE ${filters.join(' AND ')}
       ORDER BY ${order}`,
      params,
    );
    return rows.map((row) => this.enrichIncident(row));
  }

  private enrichIncident(row: IncidentRow & Record<string, unknown>) {
    const evidence = row.evidence_urls;
    const urls = Array.isArray(evidence)
      ? evidence
      : typeof evidence === 'string'
        ? JSON.parse(evidence)
        : [];
    const currentPoints = Number(row.current_demerit_points ?? 0);
    const points = Number(row.points ?? 0);
    return {
      ...row,
      evidence_urls: urls,
      current_demerit_points: currentPoints,
      projected_demerit_points:
        row.status === 'PENDING_DC_REVIEW' ? currentPoints + points : currentPoints,
      threshold_warning:
        row.status === 'PENDING_DC_REVIEW' && currentPoints + points >= SUBJECT_BACK_THRESHOLD,
    };
  }

  private async resolveStudentUserId(tenantId: string, identifier: string): Promise<string> {
    const isUuid = DemeritsService.UUID_RE.test(identifier);
    const rows = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = 'Student'
         AND (
           ($2 = true AND u.user_id = $3::uuid)
           OR lower(u.official_email) = lower($4)
           OR lower(COALESCE(sp.enrollment_no, '')) = lower($4)
           OR lower(COALESCE(sp.enrollment_number, '')) = lower($4)
         )
       LIMIT 1`,
      [tenantId, isUuid, identifier, identifier],
    );
    if (!rows[0]?.user_id) {
      throw new BadRequestException('Student not found');
    }
    return rows[0].user_id;
  }

  private async resolveCourseId(tenantId: string, identifier: string): Promise<string> {
    const isUuid = DemeritsService.UUID_RE.test(identifier);
    const rows = isUuid
      ? await this.db.query<Array<{ course_id: string }>>(
          `SELECT course_id FROM academic_courses WHERE tenant_id = $1 AND course_id = $2::uuid LIMIT 1`,
          [tenantId, identifier],
        )
      : await this.db.query<Array<{ course_id: string }>>(
          `SELECT course_id FROM academic_courses WHERE tenant_id = $1 AND upper(course_code) = upper($2) LIMIT 1`,
          [tenantId, identifier],
        );
    if (!rows[0]?.course_id) {
      throw new BadRequestException('Subject/course not found');
    }
    return rows[0].course_id;
  }

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    const rows = (await qr.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
       ) AS exists`,
      [table],
    )) as Array<{ exists: boolean }>;
    return Boolean(rows[0]?.exists);
  }
}

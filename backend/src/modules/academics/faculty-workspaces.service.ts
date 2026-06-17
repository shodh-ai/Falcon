import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { assertNoPendingSql } from '../../common/validators/pending-request.util';

const EXAM_TYPES = ['CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT'] as const;
type ExamType = (typeof EXAM_TYPES)[number];

/** Canonical roll-number expression aligned with student profile schema. */
const ROLL_NUMBER_SQL = `COALESCE(sp.enrollment_no, u.user_id::text)`;

@Injectable()
export class FacultyWorkspacesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listFacultyCourses(facultyUserId: string, tenantId: string) {
    const fromTimetable = await this.dataSource.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       INNER JOIN academic_timetables t ON t.course_id = c.course_id AND t.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND t.faculty_user_id = $2
       ORDER BY c.course_code`,
      [tenantId, facultyUserId],
    );
    if (fromTimetable.length) return fromTimetable;

    return this.dataSource.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       INNER JOIN academic_marks m ON m.course_id = c.course_id AND m.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND m.uploaded_by = $2
       ORDER BY c.course_code`,
      [tenantId, facultyUserId],
    );
  }

  async getWeeklyTimetable(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time, t.room,
              c.course_id, c.course_code, c.course_name
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.tenant_id = $1 AND t.faculty_user_id = $2
       ORDER BY t.day_of_week, t.start_time`,
      [tenantId, facultyUserId],
    );
  }

  async listMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const rows = await this.dataSource.query(
      `SELECT
         u.user_id AS student_user_id,
         u.name,
         ${ROLL_NUMBER_SQL} AS roll_number,
         m.mark_id,
         m.marks_obtained,
         m.max_marks,
         m.co_mapped,
         m.status AS mark_status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN academic_marks m
         ON m.tenant_id = e.tenant_id
        AND m.student_user_id = e.student_user_id
        AND m.course_id = e.course_id
        AND m.exam_type = $3
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
       ORDER BY u.name`,
      [tenantId, courseId, examType],
    );

    const maxMarksDefault =
      rows.find((r: { max_marks: number | null }) => r.max_marks != null)?.max_marks ?? 50;
    const publishStatus = rows.some((r: { mark_status: string | null }) => r.mark_status === 'PUBLISHED')
      ? 'PUBLISHED'
      : 'DRAFT';

    return {
      exam_type: examType,
      course_id: courseId,
      max_marks_default: maxMarksDefault,
      publish_status: publishStatus,
      rows: rows.map(
        (s: {
          student_user_id: string;
          name: string;
          roll_number: string;
          mark_id: string | null;
          marks_obtained: string | null;
          max_marks: number | null;
          co_mapped: string | null;
          mark_status: string | null;
        }) => ({
          student_user_id: s.student_user_id,
          name: s.name,
          roll_number: s.roll_number,
          mark_id: s.mark_id ?? null,
          marks_obtained: s.marks_obtained != null ? Number(s.marks_obtained) : null,
          max_marks: s.max_marks ?? maxMarksDefault,
          co_mapped: s.co_mapped ?? null,
          status: s.mark_status ?? 'DRAFT',
        }),
      ),
    };
  }

  async saveMarksDraft(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      exam_type: string;
      max_marks: number;
      entries: { student_user_id: string; marks_obtained: number; co_mapped?: string }[];
    },
  ) {
    if (!EXAM_TYPES.includes(dto.exam_type as ExamType)) {
      throw new BadRequestException('Invalid exam_type');
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const locked = await this.dataSource.query(
      `SELECT 1 FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PUBLISHED' LIMIT 1`,
      [tenantId, dto.course_id, dto.exam_type],
    );
    if (locked[0]) {
      throw new ForbiddenException('Marks are COE-published and locked. Contact Exam Cell for changes.');
    }
    const maxMarks = dto.max_marks;
    for (const entry of dto.entries) {
      if (entry.marks_obtained > maxMarks) {
        throw new BadRequestException(`Marks cannot exceed ${maxMarks}`);
      }
      if (entry.marks_obtained < 0) {
        throw new BadRequestException('Marks cannot be negative');
      }
    }

    if (dto.entries.length > 0) {
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [tenantId, dto.course_id, dto.exam_type, maxMarks, facultyUserId];
      let paramIdx = 6;
      for (const entry of dto.entries) {
        valuePlaceholders.push(
          `($1, $${paramIdx++}, $2, $3, $${paramIdx++}, $4, $${paramIdx++}, 'DRAFT', $5, NOW())`,
        );
        params.push(entry.student_user_id, entry.marks_obtained, entry.co_mapped ?? null);
      }
      await this.dataSource.query(
        `INSERT INTO academic_marks (
           tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks,
           co_mapped, status, uploaded_by, updated_at
         ) VALUES ${valuePlaceholders.join(', ')}
         ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           max_marks = EXCLUDED.max_marks,
           co_mapped = EXCLUDED.co_mapped,
           status = 'DRAFT',
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = NOW()`,
        params,
      );
    }
    return { saved: dto.entries.length, status: 'DRAFT' };
  }

  async publishMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const result = await this.dataSource.query(
      `UPDATE academic_marks
       SET status = 'PENDING_COE', updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND uploaded_by = $4 AND status = 'DRAFT'
       RETURNING mark_id`,
      [tenantId, courseId, examType, facultyUserId],
    );

    const courseRows = await this.dataSource.query<Array<{ course_name: string }>>(
      `SELECT course_name FROM academic_courses WHERE course_id = $1 AND tenant_id = $2 LIMIT 1`,
      [courseId, tenantId],
    );
    const courseName = courseRows[0]?.course_name ?? 'your course';

    const publishedCount = Array.isArray(result) && result.length === 2 && typeof result[1] === 'number' 
      ? result[1] 
      : result.length;
    if (publishedCount === 0) {
      throw new BadRequestException(
        'No draft marks found to submit. Save draft marks first for this course and exam type.',
      );
    }
    return { published: publishedCount, status: 'PENDING_COE', course_name: courseName };
  }

  async listCoPoMappings(tenantId: string, courseId: string) {
    return this.dataSource.query(
      `SELECT * FROM course_co_po_mappings
       WHERE tenant_id = $1 AND course_id = $2
       ORDER BY co_code, po_code`,
      [tenantId, courseId],
    );
  }

  async upsertCoPoMapping(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      co_code: string;
      po_code: string;
      question_ref?: string;
      weight_percent: number;
      academic_year: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO course_co_po_mappings (
         tenant_id, course_id, co_code, po_code, question_ref, weight_percent, academic_year, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, course_id, co_code, po_code, question_ref, academic_year) DO UPDATE SET
         weight_percent = EXCLUDED.weight_percent
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        dto.co_code,
        dto.po_code,
        dto.question_ref ?? '',
        dto.weight_percent,
        dto.academic_year,
        facultyUserId,
      ],
    );
    return rows[0];
  }

  async listClassAdjustments(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT a.*, c.course_code, c.course_name
       FROM class_adjustments a
       INNER JOIN academic_courses c ON c.course_id = a.course_id
       WHERE a.tenant_id = $1 AND a.faculty_user_id = $2
       ORDER BY a.created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async createClassAdjustment(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      adjustment_type: string;
      original_date?: string;
      new_date?: string;
      reason?: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);

    await assertNoPendingSql(
      this.dataSource,
      `SELECT COUNT(*)::text AS count FROM class_adjustments
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3
         AND status = 'PENDING_HOD_APPROVAL'`,
      [tenantId, facultyUserId, dto.course_id],
      'You already have a pending schedule change for this course. Wait for HoD approval on the existing request, or cancel it before submitting another.',
    );

    const rows = await this.dataSource.query(
      `INSERT INTO class_adjustments (
         tenant_id, course_id, faculty_user_id, adjustment_type, original_date, new_date, reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.adjustment_type,
        dto.original_date ?? null,
        dto.new_date ?? null,
        dto.reason ?? null,
      ],
    );
    return rows[0];
  }

  async listHodPendingAdjustments(hodUserId: string, tenantId: string) {
    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = Array.from(
      new Set<number>([
        ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
        ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
      ]),
    );
    if (!deptIds.length) return [];

    return this.dataSource.query(
      `SELECT a.adjustment_id, a.adjustment_type, a.original_date, a.new_date, a.reason, a.status,
              c.course_code, c.course_name, u.name AS faculty_name, u.official_email AS faculty_email
       FROM class_adjustments a
       INNER JOIN academic_courses c ON c.course_id = a.course_id
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1 AND a.status = 'PENDING_HOD_APPROVAL'
         AND u.dept_id = ANY($2::int[])
       ORDER BY a.created_at ASC`,
      [tenantId, deptIds],
    );
  }

  async actOnClassAdjustment(
    hodUserId: string,
    tenantId: string,
    adjustmentId: string,
    action: 'APPROVE' | 'REJECT',
    remarks?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT a.*, u.dept_id AS faculty_dept_id
       FROM class_adjustments a
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.adjustment_id = $1 AND a.tenant_id = $2`,
      [adjustmentId, tenantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Class adjustment not found');
    if (row.status !== 'PENDING_HOD_APPROVAL') {
      throw new BadRequestException('Adjustment has already been processed');
    }

    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = new Set<number>([
      ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
      ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
    ]);
    if (!deptIds.has(Number(row.faculty_dept_id))) {
      throw new ForbiddenException('HOD can act only on adjustments from their department');
    }

    if (action === 'REJECT') {
      if (!remarks?.trim()) throw new BadRequestException('Rejection remarks are required');
      await this.dataSource.query(
        `UPDATE class_adjustments SET status = 'REJECTED', hod_remarks = $3 WHERE adjustment_id = $1 AND tenant_id = $2`,
        [adjustmentId, tenantId, remarks.trim()],
      );
    } else {
      await this.dataSource.query(
        `UPDATE class_adjustments SET status = 'APPROVED' WHERE adjustment_id = $1 AND tenant_id = $2`,
        [adjustmentId, tenantId],
      );
    }

    const faculty = await this.dataSource.query<Array<{ user_id: string; tenant_id: string; name: string }>>(
      `SELECT user_id, tenant_id, name FROM users WHERE user_id = $1`,
      [row.faculty_user_id],
    );
    if (faculty[0]) {
      this.notify.leaveApproved({
        tenantId: faculty[0].tenant_id,
        userId: faculty[0].user_id,
        title: action === 'APPROVE' ? 'Extra class approved' : 'Extra class rejected',
        message:
          action === 'APPROVE'
            ? 'Your extra class request was approved by your HOD.'
            : `Your extra class request was rejected.${remarks ? ` Reason: ${remarks}` : ''}`,
        actionLink: '/faculty/timetable',
      });
    }

    const updated = await this.dataSource.query(`SELECT * FROM class_adjustments WHERE adjustment_id = $1`, [
      adjustmentId,
    ]);
    return updated[0];
  }

  async listResearchLogs(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM faculty_research_logs
       WHERE tenant_id = $1 AND faculty_user_id = $2
       ORDER BY published_date DESC NULLS LAST, created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async createResearchLog(
    facultyUserId: string,
    tenantId: string,
    dto: {
      publication_title: string;
      journal_name?: string;
      indexing_type?: string;
      publication_type?: string;
      published_date?: string;
      proof_file_path?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_research_logs (
         tenant_id, faculty_user_id, publication_title, journal_name, indexing_type,
         publication_type, published_date, proof_file_path
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        facultyUserId,
        dto.publication_title,
        dto.journal_name ?? null,
        dto.indexing_type ?? null,
        dto.publication_type ?? 'JOURNAL',
        dto.published_date ?? null,
        dto.proof_file_path ?? null,
      ],
    );
    return rows[0];
  }

  async listInvigilation(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM faculty_invigilation_assignments
       WHERE tenant_id = $1 AND faculty_user_id = $2
       ORDER BY exam_date ASC`,
      [tenantId, facultyUserId],
    );
  }

  async assignProjectGuide(
    facultyUserId: string,
    tenantId: string,
    data: { project_title: string; program?: string; start_date?: string; end_date?: string; funding_allocated?: number; student_ids: string[] },
  ) {
    // Validate max 4 active projects
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS active_count FROM faculty_project_guides 
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND status = 'ACTIVE'`,
      [tenantId, facultyUserId]
    );
    if (parseInt(countRes[0].active_count) >= 4) {
      throw new BadRequestException('Faculty member cannot have more than 4 active projects simultaneously.');
    }

    const guideId = crypto.randomUUID();

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `INSERT INTO faculty_project_guides 
          (guide_id, tenant_id, faculty_user_id, project_title, program, status, start_date, end_date, funding_allocated, funding_consumed, created_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, 0, NOW())`,
        [guideId, tenantId, facultyUserId, data.project_title, data.program, data.start_date, data.end_date, data.funding_allocated || 0]
      );

      for (const studentId of data.student_ids) {
        await queryRunner.query(
          `INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id) VALUES ($1, $2, $3)`,
          [guideId, studentId, tenantId]
        );
      }

      await queryRunner.commitTransaction();
      return { guide_id: guideId };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async listProjectGuides(facultyUserId: string, tenantId: string) {
    const guides = await this.dataSource.query(
      `SELECT 
         g.*,
         (
           SELECT COALESCE(json_agg(
             json_build_object(
               'student_user_id', pgs.student_user_id,
               'name', u.name,
               'official_email', u.official_email,
               'department', d.dept_name,
               'grade', pgs.grade
             )
           ) FILTER (WHERE pgs.student_user_id IS NOT NULL), '[]')
           FROM project_guide_students pgs
           LEFT JOIN users u ON u.user_id = pgs.student_user_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id
           WHERE pgs.guide_id = g.guide_id
         ) AS students,
         (
           SELECT COALESCE(json_agg(fr.* ORDER BY fr.created_at ASC), '[]')
           FROM project_funding_requests fr
           WHERE fr.guide_id = g.guide_id
         ) AS funding_requests
       FROM faculty_project_guides g
       WHERE g.tenant_id = $1 AND g.faculty_user_id = $2
       ORDER BY CASE g.status WHEN 'COMPLETED' THEN 1 ELSE 0 END, g.created_at DESC`,
      [tenantId, facultyUserId],
    );
    return guides;
  }

  async updateProjectStudents(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
    students: { student_user_id: string; grade?: string }[]
  ) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `DELETE FROM project_guide_students WHERE guide_id = $1 AND tenant_id = $2`,
        [guideId, tenantId]
      );
      for (const st of students) {
        await queryRunner.query(
          `INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id) VALUES ($1, $2, $3, $4)`,
          [guideId, st.student_user_id, st.grade || null, tenantId]
        );
      }
      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async completeProject(guideId: string, facultyUserId: string, tenantId: string) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    await this.dataSource.query(
      `UPDATE faculty_project_guides SET status = 'COMPLETED', end_date = CURRENT_DATE WHERE guide_id = $1 AND tenant_id = $2`,
      [guideId, tenantId]
    );
    return { success: true };
  }

  async requestFunding(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
    amount: number,
    purpose: string
  ) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    // Check if there's already a pending request
    const existing = await this.dataSource.query(
      `SELECT 1 FROM project_funding_requests WHERE guide_id = $1 AND status IN ('PENDING_HOD', 'APPROVED_HOD')`,
      [guideId]
    );
    if (existing.length > 0) {
      throw new BadRequestException('A funding request is already pending or approved and awaiting transfer.');
    }

    const rows = await this.dataSource.query(
      `INSERT INTO project_funding_requests (tenant_id, guide_id, requested_by, amount, purpose)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, guideId, facultyUserId, amount, purpose]
    );

    const hodRows = await this.dataSource.query(
      `SELECT d.hod_user_id, u.name as faculty_name
       FROM users u 
       JOIN departments d ON u.dept_id = d.dept_id 
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [facultyUserId, tenantId]
    );

    if (hodRows.length > 0 && hodRows[0].hod_user_id) {
      this.notify.approvalRequired({
        tenantId,
        userId: hodRows[0].hod_user_id,
        category: 'Funding',
        requestType: 'Project Funding Request',
        requesterName: hodRows[0].faculty_name || 'Faculty',
        title: 'New Project Funding Request',
        message: `A new funding request of ₹${amount} requires your approval.`,
        actionLink: '/hod/inbox'
      });
    }

    return rows[0];
  }

  async listHodFundingRequests(hodUserId: string, tenantId: string) {
    // Only return requests for departments where this user is HOD
    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
       INNER JOIN users u ON u.user_id = fr.requested_by
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND d.hod_user_id = $2
       ORDER BY fr.created_at DESC`,
      [tenantId, hodUserId]
    );
  }

  async listDeanFundingRequests(tenantId: string) {
    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
       INNER JOIN users u ON u.user_id = fr.requested_by
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND fr.status IN ('APPROVED_HOD', 'APPROVED_DEAN', 'REJECTED_DEAN')
       ORDER BY fr.created_at DESC`,
      [tenantId]
    );
  }

  async updateHodFundingRequest(
    requestId: string,
    status: 'APPROVED_HOD' | 'REJECTED_HOD',
    commitMessage: string,
    hodUserId: string,
    tenantId: string
  ) {
    const rows = await this.dataSource.query(
      `UPDATE project_funding_requests
       SET status = $1, hod_commit_message = $2, hod_user_id = $3, updated_at = NOW()
       WHERE request_id = $4 AND tenant_id = $5 AND status = 'PENDING_HOD'
       RETURNING *`,
      [status, commitMessage, hodUserId, requestId, tenantId]
    );
    if (!rows.length) {
      throw new NotFoundException('Pending funding request not found or unauthorized');
    }
    
    const updatedRequest = rows[0];

    if (status === 'APPROVED_HOD') {
      const deanUsers = await this.dataSource.query(
        `SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.tenant_id = $1 AND r.role_name = 'Dean'`,
        [tenantId]
      );
      
      for (const d of deanUsers) {
        this.notify.approvalRequired({
          tenantId,
          userId: d.user_id,
          category: 'Funding',
          requestType: 'Project Funding Request',
          requesterName: 'HOD',
          title: 'Funding Request Pending Dean Approval',
          message: `A funding request of ₹${updatedRequest.amount} was approved by HOD and requires your final approval.`,
          actionLink: '/dean/inbox'
        });
      }
    }

    return updatedRequest;
  }

  async updateDeanFundingRequest(
    requestId: string,
    status: 'APPROVED_DEAN' | 'REJECTED_DEAN',
    commitMessage: string,
    deanUserId: string,
    tenantId: string
  ) {
    const rows = await this.dataSource.query(
      `UPDATE project_funding_requests
       SET status = $1, dean_commit_message = $2, dean_user_id = $3, updated_at = NOW()
       WHERE request_id = $4 AND tenant_id = $5 AND status = 'APPROVED_HOD'
       RETURNING *`,
      [status, commitMessage, deanUserId, requestId, tenantId]
    );
    if (!rows.length) {
      throw new NotFoundException('Pending funding request not found or unauthorized');
    }
    
    const updatedRequest = rows[0];

    if (status === 'APPROVED_DEAN') {
      const financeUsers = await this.dataSource.query(
        `SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.tenant_id = $1 AND r.role_name IN ('FinanceAdmin', 'FinanceAccountant', 'Finance', 'Accountant')`,
        [tenantId]
      );
      
      for (const f of financeUsers) {
        this.notify.approvalRequired({
          tenantId,
          userId: f.user_id,
          category: 'Funding',
          requestType: 'Project Funding Request',
          requesterName: 'Dean',
          title: 'Funding Request Dean Approved',
          message: `A funding request of ₹${updatedRequest.amount} was approved by the Dean and requires your transfer.`,
          actionLink: '/finance/funding-requests'
        });
      }
    }

    return updatedRequest;
  }

  async listProjectReports(guideId: string, facultyUserId: string, tenantId: string) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    return this.dataSource.query(
      `SELECT * FROM project_weekly_reports WHERE guide_id = $1 ORDER BY week_no`,
      [guideId],
    );
  }

  async reviewProjectReport(
    reportId: string,
    facultyUserId: string,
    tenantId: string,
    dto: { status: string; ce_marks?: number; faculty_remarks?: string },
  ) {
    const report = await this.dataSource.query(
      `SELECT r.report_id, g.faculty_user_id
       FROM project_weekly_reports r
       INNER JOIN faculty_project_guides g ON g.guide_id = r.guide_id
       WHERE r.report_id = $1 AND r.tenant_id = $2`,
      [reportId, tenantId],
    );
    if (!report[0] || report[0].faculty_user_id !== facultyUserId) {
      throw new ForbiddenException();
    }
    const rows = await this.dataSource.query(
      `UPDATE project_weekly_reports
       SET status = $2, ce_marks = $3, faculty_remarks = $4, reviewed_at = NOW()
       WHERE report_id = $1
       RETURNING *`,
      [reportId, dto.status, dto.ce_marks ?? null, dto.faculty_remarks ?? null],
    );
    return rows[0];
  }

  async getStudentAnalytics(facultyUserId: string, tenantId: string, courseId?: string) {
    const params: unknown[] = [tenantId, facultyUserId];
    let courseFilter = '';
    if (courseId) {
      courseFilter = ' AND e.course_id = $3';
      params.push(courseId);
      await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    }
    return this.dataSource.query(
      `SELECT u.user_id AS student_user_id, u.name, c.course_id, c.course_code, c.course_name,
              e.attendance_percent,
              COALESCE((
                SELECT AVG(m.marks_obtained::float / NULLIF(m.max_marks, 0) * 100)
                FROM academic_marks m
                WHERE m.student_user_id = u.user_id AND m.course_id = e.course_id AND m.tenant_id = e.tenant_id
              ), 0) AS internal_avg_percent
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1 AND e.status = 'ENROLLED'
         AND EXISTS (
           SELECT 1 FROM academic_timetables t
           WHERE t.course_id = c.course_id AND t.faculty_user_id = $2 AND t.tenant_id = e.tenant_id
         )
         ${courseFilter}
       ORDER BY e.attendance_percent ASC, internal_avg_percent ASC`,
      params,
    );
  }

  async listLogbook(facultyUserId: string, tenantId: string, courseId?: string) {
    const params: unknown[] = [tenantId, facultyUserId];
    let filter = '';
    if (courseId) {
      filter = ' AND course_id = $3';
      params.push(courseId);
    }
    return this.dataSource.query(
      `SELECT l.*, c.course_code, c.course_name
       FROM faculty_class_logbook l
       INNER JOIN academic_courses c ON c.course_id = l.course_id
       WHERE l.tenant_id = $1 AND l.faculty_user_id = $2 ${filter}
       ORDER BY l.class_date DESC`,
      params,
    );
  }

  async createLogbookEntry(
    facultyUserId: string,
    tenantId: string,
    dto: { course_id: string; class_date: string; topic_summary: string },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_class_logbook (tenant_id, course_id, faculty_user_id, class_date, topic_summary)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, course_id, faculty_user_id, class_date) DO UPDATE SET
         topic_summary = EXCLUDED.topic_summary
       RETURNING *`,
      [tenantId, dto.course_id, facultyUserId, dto.class_date, dto.topic_summary],
    );
    return rows[0];
  }

  async listRemedialActions(facultyUserId: string, tenantId: string, limit = 50) {
    return this.dataSource.query(
      `SELECT r.remedial_id, r.student_user_id, r.course_id, r.reason, r.action_taken,
              r.scheduled_at, r.status, r.created_at,
              u.name AS student_name, c.course_code, c.course_name
       FROM faculty_remedial_actions r
       INNER JOIN users u ON u.user_id = r.student_user_id
       LEFT JOIN academic_courses c ON c.course_id = r.course_id
       WHERE r.tenant_id = $1 AND r.faculty_user_id = $2
       ORDER BY r.created_at DESC
       LIMIT $3`,
      [tenantId, facultyUserId, limit],
    );
  }

  async createRemedialAction(
    facultyUserId: string,
    tenantId: string,
    dto: {
      student_user_id: string;
      course_id?: string;
      reason: string;
      action_taken: string;
      scheduled_at?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_remedial_actions (
         tenant_id, faculty_user_id, student_user_id, course_id, reason, action_taken, scheduled_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        facultyUserId,
        dto.student_user_id,
        dto.course_id ?? null,
        dto.reason,
        dto.action_taken,
        dto.scheduled_at ?? null,
      ],
    );
    return rows[0];
  }

  async getLessonPlan(facultyUserId: string, tenantId: string, courseId: string) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const rows = await this.dataSource.query(
      `SELECT * FROM course_lesson_plans
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3`,
      [tenantId, courseId, facultyUserId],
    );
    return rows[0] ?? { course_id: courseId, handout_url: null, units: [], reference_links: [], status: 'DRAFT' };
  }

  async upsertLessonPlan(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      handout_url?: string;
      units?: unknown[];
      reference_links?: unknown[];
      status?: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO course_lesson_plans (
         tenant_id, course_id, faculty_user_id, handout_url, units, reference_links, status, updated_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,NOW())
       ON CONFLICT (tenant_id, course_id, faculty_user_id) DO UPDATE SET
         handout_url = EXCLUDED.handout_url,
         units = EXCLUDED.units,
         reference_links = EXCLUDED.reference_links,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.handout_url ?? null,
        JSON.stringify(dto.units ?? []),
        JSON.stringify(dto.reference_links ?? []),
        dto.status ?? 'DRAFT',
      ],
    );
    return rows[0];
  }

  private async assertFacultyOwnsCourse(facultyUserId: string, tenantId: string, courseId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM academic_timetables
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3 LIMIT 1`,
      [tenantId, facultyUserId, courseId],
    );
    if (!rows.length) {
      throw new ForbiddenException('You are not assigned to this course');
    }
  }

  private async assertOwnsGuide(guideId: string, facultyUserId: string, tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM faculty_project_guides
       WHERE guide_id = $1 AND faculty_user_id = $2 AND tenant_id = $3`,
      [guideId, facultyUserId, tenantId],
    );
    if (!rows.length) {
      throw new NotFoundException('Project guide not found');
    }
  }
}

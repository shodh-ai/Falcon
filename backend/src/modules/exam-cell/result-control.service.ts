import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';
import {
  computeGradeFromPercent,
  computePassFail,
  parseGradeBands,
} from './grading-engine';
import type {
  ConfigureSessionRulesDto,
  CreateResultSessionDto,
  DeclareResultSessionDto,
  OpenResultEntryDto,
  ReopenResultEntryDto,
} from './dto/result-control.dto';

@Injectable()
export class ResultControlService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly audit: ExamCellAuditService,
  ) {}

  listSessions(tenantId: string) {
    return this.db.query(
      `SELECT s.*,
              c.course_code,
              c.course_name,
              gp.policy_name AS grading_policy_name,
              (SELECT COUNT(*)::int FROM academic_marks m
               WHERE m.tenant_id = s.tenant_id AND m.course_id = s.course_id
                 AND m.exam_type = s.exam_type AND m.status = 'PENDING_COE') AS pending_coe_count,
              (SELECT COUNT(*)::int FROM student_exam_reports r WHERE r.session_id = s.session_id) AS report_count
       FROM exam_result_sessions s
       JOIN academic_courses c ON c.course_id = s.course_id
       LEFT JOIN academic_grading_policies gp ON gp.policy_id = s.grading_policy_id
       WHERE s.tenant_id = $1
       ORDER BY s.updated_at DESC, s.semester DESC`,
      [tenantId],
    );
  }

  async getSession(tenantId: string, sessionId: string) {
    const rows = await this.db.query(
      `SELECT s.*, c.course_code, c.course_name, gp.policy_name AS grading_policy_name
       FROM exam_result_sessions s
       JOIN academic_courses c ON c.course_id = s.course_id
       LEFT JOIN academic_grading_policies gp ON gp.policy_id = s.grading_policy_id
       WHERE s.tenant_id = $1 AND s.session_id = $2`,
      [tenantId, sessionId],
    );
    if (!rows[0]) throw new NotFoundException('Result session not found');
    const workflow = await this.sessionWorkflowState(tenantId, sessionId);
    return { ...rows[0], ...workflow };
  }

  private async sessionWorkflowState(tenantId: string, sessionId: string) {
    const auditAction = await this.audit.latestAction(tenantId, sessionId, [
      'RESULT_COE_AUDIT_PASSED',
      'RESULT_COE_AUDIT_ANOMALY',
    ]);
    const coe_audit_status =
      auditAction === 'RESULT_COE_AUDIT_PASSED'
        ? 'passed'
        : auditAction === 'RESULT_COE_AUDIT_ANOMALY'
          ? 'anomaly'
          : 'idle';
    const approvalRows = await this.db
      .query<Array<{ status: string }>>(
        `SELECT status FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY requested_at DESC LIMIT 1`,
        [tenantId, sessionId],
      )
      .catch(() => []);
    const deanApprovalStatus = approvalRows[0]?.status ?? null;
    const dean_approved =
      deanApprovalStatus === 'APPROVED' ||
      (await this.audit.hasAction(tenantId, sessionId, 'RESULT_DEAN_APPROVED'));
    return {
      coe_audit_status,
      dean_approved,
      dean_approval_status: deanApprovalStatus,
    };
  }

  async createSession(tenantId: string, dto: CreateResultSessionDto) {
    const courseRows = await this.db.query(
      `SELECT course_id FROM academic_courses WHERE course_id = $1 AND tenant_id = $2`,
      [dto.course_id, tenantId],
    );
    if (!courseRows[0]) throw new BadRequestException('Course not found');

    const rows = await this.db.query(
      `INSERT INTO exam_result_sessions (
         tenant_id, course_id, exam_type, semester, max_marks, pass_marks, grading_policy_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, course_id, exam_type, semester) DO UPDATE SET
         max_marks = EXCLUDED.max_marks,
         pass_marks = COALESCE(EXCLUDED.pass_marks, exam_result_sessions.pass_marks),
         grading_policy_id = COALESCE(EXCLUDED.grading_policy_id, exam_result_sessions.grading_policy_id),
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        dto.exam_type,
        dto.semester ?? 4,
        dto.max_marks ?? 100,
        dto.pass_marks ?? null,
        dto.grading_policy_id ?? null,
      ],
    );
    return this.getSession(tenantId, rows[0].session_id);
  }

  async openEntry(
    tenantId: string,
    sessionId: string,
    dto: OpenResultEntryDto,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (session.declared_at) {
      throw new BadRequestException(
        'Cannot open entry after results are declared',
      );
    }
    await this.db.query(
      `UPDATE exam_result_sessions
       SET entry_status = 'OPEN',
           entry_open_at = COALESCE($2::timestamptz, NOW()),
           entry_close_at = $3::timestamptz,
           marks_locked = FALSE,
           marks_locked_at = NULL,
           marks_locked_by = NULL,
           reopen_reason = NULL,
           updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, dto.entry_open_at ?? null, dto.entry_close_at ?? null],
    );
    return this.getSession(tenantId, sessionId);
  }

  async closeEntry(tenantId: string, sessionId: string) {
    await this.getSession(tenantId, sessionId);
    await this.db.query(
      `UPDATE exam_result_sessions SET entry_status = 'CLOSED', updated_at = NOW() WHERE session_id = $1`,
      [sessionId],
    );
    return this.getSession(tenantId, sessionId);
  }

  async lockMarks(tenantId: string, sessionId: string, actorUserId: string) {
    await this.getSession(tenantId, sessionId);
    await this.db.query(
      `UPDATE exam_result_sessions
       SET entry_status = 'LOCKED', marks_locked = TRUE, marks_locked_at = NOW(),
           marks_locked_by = $2, updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, actorUserId],
    );
    return this.getSession(tenantId, sessionId);
  }

  /** Close faculty entry and lock submitted marks before grade preview / declaration. */
  async prepareForDeclaration(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (session.declared_at) {
      throw new BadRequestException('Results already declared');
    }
    const pending = await this.db.query<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, session.course_id, session.exam_type],
    );
    if (!pending[0]?.c) {
      throw new BadRequestException(
        'No faculty submissions awaiting declaration',
      );
    }
    await this.closeEntry(tenantId, sessionId);
    await this.lockMarks(tenantId, sessionId, actorUserId);
    return this.getSession(tenantId, sessionId);
  }

  async reopenEntry(
    tenantId: string,
    sessionId: string,
    dto: ReopenResultEntryDto,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (session.declared_at) {
      throw new BadRequestException('Cannot reopen after declaration');
    }
    await this.db.query(
      `UPDATE exam_result_sessions
       SET entry_status = 'OPEN', marks_locked = FALSE, marks_locked_at = NULL,
           marks_locked_by = NULL, reopen_reason = $2, updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, dto.reason.trim()],
    );
    await this.db.query(
      `UPDATE academic_marks SET status = 'DRAFT', updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, session.course_id, session.exam_type],
    );
    return this.getSession(tenantId, sessionId);
  }

  async configureRules(
    tenantId: string,
    sessionId: string,
    dto: ConfigureSessionRulesDto,
  ) {
    await this.getSession(tenantId, sessionId);
    await this.db.query(
      `UPDATE exam_result_sessions
       SET pass_marks = COALESCE($2, pass_marks),
           grading_policy_id = COALESCE($3, grading_policy_id),
           max_marks = COALESCE($4, max_marks),
           updated_at = NOW()
       WHERE session_id = $1`,
      [
        sessionId,
        dto.pass_marks ?? null,
        dto.grading_policy_id ?? null,
        dto.max_marks ?? null,
      ],
    );
    return this.getSession(tenantId, sessionId);
  }

  listGradingPolicies() {
    return this.db.query(
      `SELECT policy_id, policy_name, program_id, effective_from, rules
       FROM academic_grading_policies ORDER BY effective_from DESC`,
    );
  }

  listCourses(tenantId: string) {
    return this.db.query(
      `SELECT course_id, course_code, course_name
       FROM academic_courses
       WHERE tenant_id = $1
       ORDER BY course_code LIMIT 300`,
      [tenantId],
    );
  }

  private async loadGradeBands(session: { grading_policy_id?: number | null }) {
    if (!session.grading_policy_id) return parseGradeBands(null);
    const rows = await this.db.query<Array<{ rules: Record<string, unknown> }>>(
      `SELECT rules FROM academic_grading_policies WHERE policy_id = $1`,
      [session.grading_policy_id],
    );
    return parseGradeBands(rows[0]?.rules);
  }

  async processSession(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    const bands = await this.loadGradeBands(session);
    const passMarks =
      session.pass_marks != null ? Number(session.pass_marks) : null;

    const marks = await this.db.query<
      Array<{
        student_user_id: string;
        student_name: string;
        marks_obtained: string;
        max_marks: string;
      }>
    >(
      `SELECT m.student_user_id, u.name AS student_name, m.marks_obtained, m.max_marks
       FROM academic_marks m JOIN users u ON u.user_id = m.student_user_id
       WHERE m.tenant_id = $1 AND m.course_id = $2 AND m.exam_type = $3
         AND m.status IN ('PENDING_COE', 'PUBLISHED')`,
      [tenantId, session.course_id, session.exam_type],
    );
    if (!marks.length)
      throw new BadRequestException('No submitted marks to process');

    const preview = marks.map((row) => {
      const obtained = Number(row.marks_obtained);
      const max = Number(row.max_marks ?? session.max_marks);
      const percent = max > 0 ? Number(((obtained / max) * 100).toFixed(2)) : 0;
      const { grade, gradePoints } = computeGradeFromPercent(percent, bands);
      const resultStatus = computePassFail(obtained, max, passMarks);
      return {
        student_user_id: row.student_user_id,
        student_name: row.student_name,
        marks_obtained: obtained,
        max_marks: max,
        percent,
        grade,
        grade_points: gradePoints,
        result_status: resultStatus,
      };
    });

    await this.db.query(
      `UPDATE exam_result_sessions SET processed_at = NOW(), processed_by = $2, updated_at = NOW() WHERE session_id = $1`,
      [sessionId, actorUserId],
    );

    return {
      session_id: sessionId,
      course_code: session.course_code,
      course_name: session.course_name,
      exam_type: session.exam_type,
      processed_count: preview.length,
      preview,
      ...(await this.sessionWorkflowState(tenantId, sessionId)),
    };
  }

  async runFormulaAudit(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    const passMarks =
      session.pass_marks != null ? Number(session.pass_marks) : null;

    const marks = await this.db.query<
      Array<{ marks_obtained: string; max_marks: string }>
    >(
      `SELECT marks_obtained, max_marks FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
         AND status IN ('PENDING_COE', 'PUBLISHED')`,
      [tenantId, session.course_id, session.exam_type],
    );
    if (!marks.length) throw new BadRequestException('No marks to audit');

    const failing = marks.filter((row) => {
      const obtained = Number(row.marks_obtained);
      const max = Number(row.max_marks ?? session.max_marks);
      if (passMarks != null) return obtained < passMarks;
      return max > 0 && (obtained / max) * 100 < 40;
    }).length;
    const rate = failing / marks.length;
    const passed = rate < 0.5;
    const action = passed
      ? 'RESULT_COE_AUDIT_PASSED'
      : 'RESULT_COE_AUDIT_ANOMALY';

    await this.audit.log(tenantId, actorUserId, {
      action,
      resource_type: 'exam_result_session',
      resource_id: sessionId,
      new_value: {
        failure_rate: Math.round(rate * 100),
        failing,
        total: marks.length,
      },
    });

    return {
      status: passed ? 'passed' : 'anomaly',
      failure_rate: Math.round(rate * 100),
      anomaly_subjects: passed
        ? []
        : [
            {
              course_code: session.course_code,
              failure_rate: Math.round(rate * 100),
            },
          ],
    };
  }

  async recordDeanApproval(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    return this.requestDeanApproval(tenantId, sessionId, actorUserId);
  }

  /** Exam Cell submits a result session for Dean approval (replaces simulated approval). */
  async requestDeanApproval(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    const coePassed = await this.audit.hasAction(
      tenantId,
      sessionId,
      'RESULT_COE_AUDIT_PASSED',
    );
    if (!coePassed) {
      throw new BadRequestException(
        'COE formula audit must pass before requesting dean approval',
      );
    }
    if (session.declared_at) {
      throw new BadRequestException('Results already declared');
    }

    const existing = await this.db.query(
      `SELECT request_id, status FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND session_id = $2 AND status = 'PENDING'
       LIMIT 1`,
      [tenantId, sessionId],
    );
    if (existing.length) {
      return { request_id: existing[0].request_id, status: 'PENDING' };
    }

    const pendingMarks = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, session.course_id, session.exam_type],
    );

    const summary = {
      course_code: session.course_code,
      course_name: session.course_name,
      exam_type: session.exam_type,
      semester: session.semester,
      pending_marks: pendingMarks[0]?.c ?? 0,
    };

    const rows = await this.db.query(
      `INSERT INTO exam_result_dean_approval_requests
         (tenant_id, session_id, status, requested_by, request_summary)
       VALUES ($1, $2, 'PENDING', $3, $4::jsonb)
       RETURNING request_id, status, requested_at`,
      [tenantId, sessionId, actorUserId, JSON.stringify(summary)],
    );
    const request = rows[0];

    await this.appendDeanApprovalHistory(
      tenantId,
      request.request_id,
      sessionId,
      actorUserId,
      'ExamCell',
      'REQUESTED',
      'PENDING',
      null,
    );

    await this.audit.log(tenantId, actorUserId, {
      action: 'RESULT_DEAN_APPROVAL_REQUESTED',
      resource_type: 'exam_result_session',
      resource_id: sessionId,
      new_value: summary,
    });

    const deanUsers = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Dean'`,
      [tenantId],
    );
    for (const dean of deanUsers) {
      this.notify.approvalRequired({
        tenantId,
        userId: dean.user_id,
        category: 'Results',
        requestType: 'Result Declaration',
        requesterName: 'Examination Cell',
        title: `Result approval required — ${session.course_code}`,
        message: `${session.course_name} (${session.exam_type}) is ready for your review before publication.`,
        actionLink: '/dean/inbox?type=RESULT_APPROVAL',
      });
    }

    return request;
  }

  async listPendingDeanResultApprovals(
    tenantId: string,
    deanUserId: string,
    query: { page?: string; limit?: string; search?: string } = {},
  ) {
    const deptIds = await resolveDeanDepartmentIds(this.db, deanUserId);
    if (!deptIds.length) {
      return { data: [], total: 0, limit: 20, offset: 0 };
    }

    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const search = query.search?.trim();
    const params: unknown[] = [tenantId, deptIds];
    let searchSql = '';
    if (search) {
      params.push(`%${search}%`);
      searchSql = ` AND (c.course_code ILIKE $${params.length} OR c.course_name ILIKE $${params.length})`;
    }

    const countRows = await this.db.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::int AS total
       FROM exam_result_dean_approval_requests r
       INNER JOIN exam_result_sessions s ON s.session_id = r.session_id
       INNER JOIN academic_courses c ON c.course_id = s.course_id
       INNER JOIN academic_timetables t ON t.course_id = c.course_id AND t.tenant_id = s.tenant_id
       INNER JOIN users fu ON fu.user_id = t.faculty_user_id
       WHERE r.tenant_id = $1 AND r.status = 'PENDING'
         AND fu.dept_id = ANY($2::int[])${searchSql}`,
      params,
    );

    params.push(limit, offset);
    const rows = await this.db.query(
      `SELECT r.request_id, r.session_id, r.status, r.requested_at, r.request_summary,
              s.course_id, s.exam_type, s.semester, s.entry_status, s.marks_locked,
              c.course_code, c.course_name,
              req.name AS requested_by_name
       FROM exam_result_dean_approval_requests r
       INNER JOIN exam_result_sessions s ON s.session_id = r.session_id
       INNER JOIN academic_courses c ON c.course_id = s.course_id
       INNER JOIN users req ON req.user_id = r.requested_by
       WHERE r.tenant_id = $1 AND r.status = 'PENDING'
         AND EXISTS (
           SELECT 1 FROM academic_timetables t
           INNER JOIN users fu ON fu.user_id = t.faculty_user_id
           WHERE t.course_id = c.course_id AND t.tenant_id = s.tenant_id
             AND fu.dept_id = ANY($2::int[])
         )${searchSql}
       ORDER BY r.requested_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      data: rows,
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async decideDeanResultApproval(
    tenantId: string,
    deanUserId: string,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
    actorRole = 'Dean',
  ) {
    const [pending] = await this.db.query<
      Array<{ request_id: string; session_id: string; status: string }>
    >(
      `SELECT request_id, session_id, status
       FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND request_id = $2 AND status = 'PENDING'
       LIMIT 1`,
      [tenantId, requestId],
    );
    if (!pending) {
      throw new NotFoundException('Pending result approval request not found');
    }

    await this.db.query(
      `UPDATE exam_result_dean_approval_requests
       SET status = $3, decided_by = $4, decided_at = NOW(),
           decision_comment = $5, updated_at = NOW()
       WHERE request_id = $1 AND tenant_id = $2`,
      [requestId, tenantId, decision, deanUserId, comment?.trim() ?? null],
    );

    await this.appendDeanApprovalHistory(
      tenantId,
      requestId,
      pending.session_id,
      deanUserId,
      actorRole,
      decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      decision,
      comment?.trim() ?? null,
    );

    await this.audit.log(tenantId, deanUserId, {
      action:
        decision === 'APPROVED'
          ? 'RESULT_DEAN_APPROVED'
          : 'RESULT_DEAN_REJECTED',
      resource_type: 'exam_result_session',
      resource_id: pending.session_id,
      new_value: { comment: comment?.trim() ?? null, decision },
    });

    return {
      request_id: requestId,
      session_id: pending.session_id,
      status: decision,
    };
  }

  async getDeanResultApprovalHistory(tenantId: string, sessionId: string) {
    return this.db
      .query(
        `SELECT h.*, u.name AS actor_name
       FROM exam_result_dean_approval_history h
       LEFT JOIN users u ON u.user_id = h.actor_user_id
       WHERE h.tenant_id = $1 AND h.session_id = $2
       ORDER BY h.created_at ASC`,
        [tenantId, sessionId],
      )
      .catch(() => []);
  }

  private async appendDeanApprovalHistory(
    tenantId: string,
    requestId: string,
    sessionId: string,
    actorUserId: string,
    actorRole: string,
    action: string,
    status: string,
    comment: string | null,
  ) {
    await this.db
      .query(
        `INSERT INTO exam_result_dean_approval_history
         (request_id, tenant_id, session_id, actor_user_id, actor_role, action, status, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          requestId,
          tenantId,
          sessionId,
          actorUserId,
          actorRole,
          action,
          status,
          comment,
        ],
      )
      .catch(() => undefined);
  }

  async applySessionGraceMarks(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
    graceMarks: number,
  ) {
    if (!Number.isFinite(graceMarks) || graceMarks <= 0) {
      throw new BadRequestException('Grace marks must be a positive number');
    }
    const session = await this.getSession(tenantId, sessionId);
    if (session.declared_at) {
      throw new BadRequestException('Results already declared');
    }

    const marks = await this.db.query<
      Array<{
        mark_id: string;
        student_user_id: string;
        marks_obtained: string;
        max_marks: string;
      }>
    >(
      `SELECT mark_id, student_user_id, marks_obtained, max_marks FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, session.course_id, session.exam_type],
    );
    if (!marks.length)
      throw new BadRequestException('No pending marks to adjust');

    let updated = 0;
    for (const row of marks) {
      const max = Number(row.max_marks ?? session.max_marks);
      const boosted = Math.min(max, Number(row.marks_obtained) + graceMarks);
      await this.db.query(
        `UPDATE academic_marks SET marks_obtained = $2, updated_at = NOW() WHERE mark_id = $1`,
        [row.mark_id, boosted],
      );
      updated += 1;
    }

    await this.audit.log(tenantId, actorUserId, {
      action: 'RESULT_GRACE_MARKS_APPLIED',
      resource_type: 'exam_result_session',
      resource_id: sessionId,
      new_value: { grace_marks: graceMarks, students_updated: updated },
    });

    const processed = await this.processSession(
      tenantId,
      sessionId,
      actorUserId,
    );
    return { updated, preview: processed.preview };
  }

  async declareSession(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
    dto: DeclareResultSessionDto,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (session.declared_at)
      throw new BadRequestException('Results already declared');

    const deanApproved = await this.db.query(
      `SELECT 1 FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND session_id = $2 AND status = 'APPROVED'
       LIMIT 1`,
      [tenantId, sessionId],
    );
    if (!deanApproved.length) {
      const legacyApproved = await this.audit.hasAction(
        tenantId,
        sessionId,
        'RESULT_DEAN_APPROVED',
      );
      if (!legacyApproved) {
        throw new BadRequestException(
          'Dean approval is required before publishing results',
        );
      }
    }

    const bands = await this.loadGradeBands(session);
    const passMarks =
      session.pass_marks != null ? Number(session.pass_marks) : null;

    const marks = await this.db.query<
      Array<{
        mark_id: string;
        student_user_id: string;
        marks_obtained: string;
        max_marks: string;
      }>
    >(
      `SELECT mark_id, student_user_id, marks_obtained, max_marks FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, session.course_id, session.exam_type],
    );
    if (!marks.length)
      throw new BadRequestException('No PENDING_COE marks to declare');

    const courseName = session.course_name ?? 'Course';
    let declared = 0;

    for (const row of marks) {
      const obtained = Number(row.marks_obtained);
      const max = Number(row.max_marks ?? session.max_marks);
      const percent = max > 0 ? Number(((obtained / max) * 100).toFixed(2)) : 0;
      const { grade, gradePoints } = computeGradeFromPercent(percent, bands);
      const resultStatus = computePassFail(obtained, max, passMarks);
      const summary = `${courseName} ${session.exam_type}: ${obtained}/${max} (${percent}%) — Grade ${grade}`;

      await this.db.query(
        `UPDATE academic_marks SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE mark_id = $1`,
        [row.mark_id],
      );

      await this.upsertExamResult(
        tenantId,
        row.student_user_id,
        session.course_id,
        session.exam_type,
        obtained,
        max,
        grade,
      );

      await this.db.query(
        `INSERT INTO student_exam_reports (
           tenant_id, session_id, student_user_id, course_id, exam_type,
           marks_obtained, max_marks, percent, grade, grade_points, result_status, report_summary, declared_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (session_id, student_user_id) DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained, max_marks = EXCLUDED.max_marks,
           percent = EXCLUDED.percent, grade = EXCLUDED.grade, grade_points = EXCLUDED.grade_points,
           result_status = EXCLUDED.result_status, report_summary = EXCLUDED.report_summary, declared_at = NOW()`,
        [
          tenantId,
          sessionId,
          row.student_user_id,
          session.course_id,
          session.exam_type,
          obtained,
          max,
          percent,
          grade,
          gradePoints,
          resultStatus,
          summary,
        ],
      );

      if (
        session.exam_type === 'END_TERM' ||
        session.exam_type === 'INTERNAL'
      ) {
        await this.db.query(
          `UPDATE student_course_enrollments
           SET grade = $4, grade_points = $5,
               status = CASE WHEN $6 = 'PASS' THEN 'COMPLETED' ELSE 'FAILED' END
           WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND semester = $7`,
          [
            tenantId,
            row.student_user_id,
            session.course_id,
            grade,
            gradePoints,
            resultStatus,
            session.semester,
          ],
        );
      }

      this.notify.examResultsPublished({
        tenantId,
        userId: row.student_user_id,
        courseName,
        examType: session.exam_type,
        actionLink: `/student/marks?report=${sessionId}`,
        message: summary,
      });

      await this.db.query(
        `UPDATE student_exam_reports SET notified_at = NOW() WHERE session_id = $1 AND student_user_id = $2`,
        [sessionId, row.student_user_id],
      );
      declared += 1;
    }

    await this.db.query(
      `UPDATE exam_result_sessions
       SET declared_at = NOW(), declared_by = $2, declaration_note = $3,
           entry_status = 'LOCKED', marks_locked = TRUE, updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, actorUserId, dto.declaration_note?.trim() ?? null],
    );

    return {
      declared,
      course_name: courseName,
      exam_type: session.exam_type,
      session_id: sessionId,
    };
  }

  /** Best-effort mirror into legacy results table; RCC uses student_exam_reports. */
  private async upsertExamResult(
    tenantId: string,
    studentUserId: string,
    courseId: string,
    examType: string,
    marksObtained: number,
    maxMarks: number,
    grade: string,
  ) {
    try {
      await this.db.query(
        `DELETE FROM academic_exam_results
         WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND exam_type = $4`,
        [tenantId, studentUserId, courseId, examType],
      );
      await this.db.query(
        `INSERT INTO academic_exam_results (
           tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, grade, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PUBLISHED')`,
        [
          tenantId,
          studentUserId,
          courseId,
          examType,
          marksObtained,
          maxMarks,
          grade,
        ],
      );
    } catch {
      // Ignore schema drift on legacy table; declaration still succeeds via student_exam_reports.
    }
  }

  async getSessionForCourse(
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    const rows = await this.db.query(
      `SELECT * FROM exam_result_sessions
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, courseId, examType],
    );
    return rows[0] ?? null;
  }

  assertFacultyEntryAllowed(
    session: {
      entry_status: string;
      marks_locked: boolean;
      entry_open_at?: string | Date | null;
      entry_close_at?: string | Date | null;
      declared_at?: string | Date | null;
    } | null,
  ) {
    if (!session) {
      throw new BadRequestException(
        'Marks entry has not been opened by Exam Cell for this exam.',
      );
    }
    if (session.declared_at) {
      throw new BadRequestException(
        'Results already declared. Marks are locked.',
      );
    }
    if (session.entry_status !== 'OPEN') {
      throw new BadRequestException(
        'Marks entry is closed. Contact Exam Cell to reopen.',
      );
    }
    if (session.marks_locked) {
      throw new BadRequestException('Marks entry is locked by Exam Cell.');
    }
    const now = Date.now();
    if (
      session.entry_open_at &&
      new Date(session.entry_open_at).getTime() > now
    ) {
      throw new BadRequestException('Marks entry window has not opened yet.');
    }
    if (
      session.entry_close_at &&
      new Date(session.entry_close_at).getTime() < now
    ) {
      throw new BadRequestException('Marks entry window has closed.');
    }
  }

  listStudentReports(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT r.*, c.course_code, c.course_name, s.declaration_note, s.semester
       FROM student_exam_reports r
       JOIN academic_courses c ON c.course_id = r.course_id
       JOIN exam_result_sessions s ON s.session_id = r.session_id
       WHERE r.tenant_id = $1 AND r.student_user_id = $2
       ORDER BY r.declared_at DESC`,
      [tenantId, studentUserId],
    );
  }

  listSessionReports(tenantId: string, sessionId: string) {
    return this.db.query(
      `SELECT r.*, u.name AS student_name FROM student_exam_reports r
       JOIN users u ON u.user_id = r.student_user_id
       WHERE r.tenant_id = $1 AND r.session_id = $2 ORDER BY u.name`,
      [tenantId, sessionId],
    );
  }
}

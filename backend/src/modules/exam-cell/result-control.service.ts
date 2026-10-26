import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';
import { isAutoSyncedExamType } from '../academics/grading-components';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { lockResultInputs } from './result-input-lock';
import {
  matchesResultApprovalState,
  resultApprovalState,
  type ResultApprovalSession,
  type ResultApprovalMark,
  type ResultApprovalState,
} from './result-approval-state';
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

type ApprovalRequest = {
  request_id: string;
  session_id: string;
  tenant_id: string;
  status: string;
  request_summary: Record<string, unknown> | null;
};

type ApprovalSession = ResultApprovalSession & {
  course_name?: string;
  course_code?: string;
  declared_at?: string | Date | null;
};

@Injectable()
export class ResultControlService {
  private readonly logger = new Logger(ResultControlService.name);

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
    const workflow = await this.sessionWorkflowState(
      tenantId,
      sessionId,
      rows[0],
    );
    return { ...rows[0], ...workflow };
  }

  private async sessionWorkflowState(
    tenantId: string,
    sessionId: string,
    session?: ApprovalSession,
  ) {
    if (!session) {
      [session] = await this.db.query<ApprovalSession[]>(
        'SELECT * FROM exam_result_sessions WHERE tenant_id = $1 AND session_id = $2',
        [requireTenantId(tenantId), sessionId],
      );
    }
    const approval = await this.latestApproval(this.db, tenantId, sessionId);
    const coeAudit = await this.latestCoeAudit(this.db, tenantId, sessionId);
    const inputs =
      session && !session.declared_at
        ? await this.approvalInputs(this.db, session, false)
        : null;
    const current =
      !!session?.marks_locked && session.entry_status === 'LOCKED';
    const coeCurrent =
      !!session?.declared_at ||
      (current &&
        !!inputs &&
        inputs.rosterValid &&
        matchesResultApprovalState(
          coeAudit?.new_value?.result_state,
          inputs.state,
        ));
    const coe_audit_status = !coeCurrent
      ? 'idle'
      : coeAudit?.action === 'RESULT_COE_AUDIT_PASSED'
        ? 'passed'
        : coeAudit?.action === 'RESULT_COE_AUDIT_ANOMALY'
          ? 'anomaly'
          : 'idle';
    const deanApprovalStatus = approval?.status ?? null;
    const dean_approved =
      deanApprovalStatus === 'APPROVED' &&
      (!!session?.declared_at ||
        (current &&
          !!inputs &&
          inputs.rosterValid &&
          matchesResultApprovalState(
            approval?.request_summary?.result_state,
            inputs.state,
          ) &&
          coe_audit_status === 'passed'));
    return {
      coe_audit_status,
      dean_approved,
      dean_approval_status: deanApprovalStatus,
    };
  }

  async createSession(
    tenantId: string,
    dto: CreateResultSessionDto,
    actorUserId?: string,
  ) {
    tenantId = requireTenantId(tenantId);
    const courseRows = await this.db.query(
      `SELECT course_id FROM academic_courses WHERE course_id = $1 AND tenant_id = $2`,
      [dto.course_id, tenantId],
    );
    if (!courseRows[0]) throw new BadRequestException('Course not found');

    const sessionId = await this.db.transaction(async (manager) => {
      await lockResultInputs(manager, tenantId, dto.course_id, dto.exam_type);
      const [existing] = await manager.query<ApprovalSession[]>(
        `SELECT * FROM exam_result_sessions
         WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND semester = $4
         FOR UPDATE`,
        [tenantId, dto.course_id, dto.exam_type, dto.semester ?? 4],
      );
      if (existing) {
        this.assertUndeclared(existing);
        await this.invalidateApprovals(
          manager,
          tenantId,
          existing.session_id,
          actorUserId,
          'Result session rules updated',
        );
      }
      const rows = await manager.query(
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
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_INPUTS_CHANGED',
          resource_type: 'exam_result_session',
          resource_id: rows[0].session_id,
          new_value: { reason: 'Result session configured' },
        },
        manager,
      );
      return rows[0].session_id as string;
    });
    return this.getSession(tenantId, sessionId);
  }

  async openEntry(
    tenantId: string,
    sessionId: string,
    dto: OpenResultEntryDto,
    actorUserId?: string,
  ) {
    await this.editSession(
      tenantId,
      sessionId,
      actorUserId,
      'Marks entry opened',
      async (manager) => {
        await manager.query(
          `UPDATE exam_result_sessions
       SET entry_status = 'OPEN',
           entry_open_at = COALESCE($2::timestamptz, NOW()),
           entry_close_at = $3::timestamptz,
           marks_locked = FALSE,
           marks_locked_at = NULL,
           marks_locked_by = NULL,
           reopen_reason = NULL,
           updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $4`,
          [
            sessionId,
            dto.entry_open_at ?? null,
            dto.entry_close_at ?? null,
            tenantId,
          ],
        );
      },
    );
    return this.getSession(tenantId, sessionId);
  }

  async closeEntry(tenantId: string, sessionId: string, actorUserId?: string) {
    await this.editSession(
      tenantId,
      sessionId,
      actorUserId,
      'Marks entry closed',
      async (manager) => {
        await manager.query(
          `UPDATE exam_result_sessions SET entry_status = 'CLOSED', updated_at = NOW()
         WHERE session_id = $1 AND tenant_id = $2`,
          [sessionId, tenantId],
        );
      },
    );
    return this.getSession(tenantId, sessionId);
  }

  async lockMarks(tenantId: string, sessionId: string, actorUserId: string) {
    await this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertUndeclared(session);
      if (session.marks_locked && session.entry_status === 'LOCKED') return;
      await this.invalidateApprovals(
        manager,
        tenantId,
        sessionId,
        actorUserId,
        'Marks batch locked for review',
      );
      await this.lockSessionMarks(manager, tenantId, sessionId, actorUserId);
    });
    return this.getSession(tenantId, sessionId);
  }

  /** Close faculty entry and lock submitted marks before grade preview / declaration. */
  async prepareForDeclaration(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    await this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertUndeclared(session);
      const pending = await manager.query<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
        [tenantId, session.course_id, session.exam_type],
      );
      if (!pending[0]?.c) {
        throw new BadRequestException(
          'No faculty submissions awaiting declaration',
        );
      }
      if (!session.marks_locked || session.entry_status !== 'LOCKED') {
        await this.invalidateApprovals(
          manager,
          tenantId,
          sessionId,
          actorUserId,
          'Marks batch prepared for review',
        );
        await this.lockSessionMarks(manager, tenantId, sessionId, actorUserId);
      }
    });
    return this.getSession(tenantId, sessionId);
  }

  async reopenEntry(
    tenantId: string,
    sessionId: string,
    dto: ReopenResultEntryDto,
    actorUserId?: string,
  ) {
    await this.editSession(
      tenantId,
      sessionId,
      actorUserId,
      'Marks entry reopened',
      async (manager, session) => {
        await manager.query(
          `UPDATE exam_result_sessions
       SET entry_status = 'OPEN', marks_locked = FALSE, marks_locked_at = NULL,
           marks_locked_by = NULL, reopen_reason = $2, updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $3`,
          [sessionId, dto.reason.trim(), tenantId],
        );
        await manager.query(
          `UPDATE academic_marks SET status = 'DRAFT', updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
          [tenantId, session.course_id, session.exam_type],
        );
      },
    );
    return this.getSession(tenantId, sessionId);
  }

  async configureRules(
    tenantId: string,
    sessionId: string,
    dto: ConfigureSessionRulesDto,
    actorUserId?: string,
  ) {
    await this.editSession(
      tenantId,
      sessionId,
      actorUserId,
      'Assessment rules changed',
      async (manager) => {
        await manager.query(
          `UPDATE exam_result_sessions
       SET pass_marks = COALESCE($2, pass_marks),
           grading_policy_id = COALESCE($3, grading_policy_id),
           max_marks = COALESCE($4, max_marks),
           updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $5`,
          [
            sessionId,
            dto.pass_marks ?? null,
            dto.grading_policy_id ?? null,
            dto.max_marks ?? null,
            tenantId,
          ],
        );
      },
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

  private async loadGradeBands(
    session: { grading_policy_id?: number | null },
    executor: DataSource | EntityManager = this.db,
  ) {
    if (!session.grading_policy_id) return parseGradeBands(null);
    const rows = await executor.query<
      Array<{ rules: Record<string, unknown> }>
    >(`SELECT rules FROM academic_grading_policies WHERE policy_id = $1`, [
      session.grading_policy_id,
    ]);
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
    return this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertReviewable(session);
      const inputs = await this.approvalInputs(manager, session);
      const passMarks =
        session.pass_marks != null ? Number(session.pass_marks) : null;

      const marks = inputs.marks;
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

      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action,
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: {
            failure_rate: Math.round(rate * 100),
            failing,
            total: marks.length,
            result_state: inputs.state,
          },
        },
        manager,
      );

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
    });
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
    const outcome = await this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertReviewable(session);
      const inputs = await this.approvalInputs(manager, session);
      await this.assertCurrentCoeAudit(manager, session, inputs.state);
      const existing = await this.latestApproval(manager, tenantId, sessionId);
      if (
        existing &&
        ['PENDING', 'APPROVED'].includes(existing.status) &&
        matchesResultApprovalState(
          existing.request_summary?.result_state,
          inputs.state,
        )
      ) {
        return {
          request: { request_id: existing.request_id, status: existing.status },
          session,
          created: false,
        };
      }
      await this.invalidateApprovals(
        manager,
        tenantId,
        sessionId,
        actorUserId,
        'Superseded result review',
      );
      const summary = {
        course_code: session.course_code,
        course_name: session.course_name,
        exam_type: session.exam_type,
        semester: session.semester,
        pending_marks: inputs.marks.length,
        result_state: inputs.state,
      };

      const rows = await manager.query(
        `INSERT INTO exam_result_dean_approval_requests
         (tenant_id, session_id, status, requested_by, request_summary, requested_at)
       VALUES ($1, $2, 'PENDING', $3, $4::jsonb, clock_timestamp())
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
        manager,
      );

      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_DEAN_APPROVAL_REQUESTED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: summary,
        },
        manager,
      );
      return { request, session, created: true };
    });
    if (!outcome.created) return outcome.request;
    const { session } = outcome;

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

    return outcome.request;
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
    if (
      !['Dean', 'SuperAdmin'].some(
        (role) => role.toLowerCase() === actorRole.trim().toLowerCase(),
      )
    ) {
      throw new ForbiddenException('Dean approval permission required');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    tenantId = requireTenantId(tenantId);
    return this.db.transaction(async (manager) => {
      const [pending] = await manager.query<ApprovalRequest[]>(
        `SELECT request_id, session_id, status
       FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND request_id = $2 AND status = 'PENDING'
       LIMIT 1`,
        [tenantId, requestId],
      );
      if (!pending) {
        throw new NotFoundException(
          'Pending result approval request not found',
        );
      }
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        pending.session_id,
      );
      this.assertReviewable(session);

      await this.assertDeanCanAccessResultSession(
        tenantId,
        deanUserId,
        pending.session_id,
        actorRole,
        manager,
      );
      const current = await this.latestApproval(
        manager,
        tenantId,
        pending.session_id,
      );
      if (
        !current ||
        current.request_id !== requestId ||
        current.status !== 'PENDING'
      ) {
        throw new NotFoundException(
          'Pending result approval request not found',
        );
      }
      const inputs = await this.approvalInputs(manager, session);
      await this.assertCurrentCoeAudit(manager, session, inputs.state);
      this.assertApprovalMatches(current, session, inputs.state);
      const updated = await manager.query<
        Array<{ request_id: string }> | [Array<{ request_id: string }>, number]
      >(
        `UPDATE exam_result_dean_approval_requests
       SET status = $3, decided_by = $4, decided_at = NOW(),
           decision_comment = $5, updated_at = NOW()
       WHERE request_id = $1 AND tenant_id = $2 AND status = 'PENDING'
       RETURNING request_id`,
        [requestId, tenantId, decision, deanUserId, comment?.trim() ?? null],
      );
      const updatedRows = Array.isArray(updated[0]) ? updated[0] : updated;
      if (!updatedRows.length)
        throw new BadRequestException('Approval request already decided');

      await this.appendDeanApprovalHistory(
        tenantId,
        requestId,
        pending.session_id,
        deanUserId,
        actorRole,
        decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        decision,
        comment?.trim() ?? null,
        manager,
      );

      await this.audit.log(
        tenantId,
        deanUserId,
        {
          action:
            decision === 'APPROVED'
              ? 'RESULT_DEAN_APPROVED'
              : 'RESULT_DEAN_REJECTED',
          resource_type: 'exam_result_session',
          resource_id: pending.session_id,
          new_value: {
            comment: comment?.trim() ?? null,
            decision,
            request_id: requestId,
            result_state: inputs.state,
          },
        },
        manager,
      );

      return {
        request_id: requestId,
        session_id: pending.session_id,
        status: decision,
      };
    });
  }

  async getDeanResultApprovalHistory(
    tenantId: string,
    deanUserId: string,
    sessionId: string,
    actorRole = 'Dean',
  ) {
    await this.assertDeanCanAccessResultSession(
      tenantId,
      deanUserId,
      sessionId,
      actorRole,
    );

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

  /**
   * A result session is Dean-visible only when a tenant timetable assigns its
   * course to faculty in one of that Dean's authorized departments. Reuse the
   * same ownership rule as the Dean approval list and fail closed when a
   * session has no attributable timetable/faculty department.
   */
  private async assertDeanCanAccessResultSession(
    tenantId: string,
    deanUserId: string,
    sessionId: string,
    actorRole: string,
    executor: DataSource | EntityManager = this.db,
  ) {
    if (actorRole.trim().toLowerCase() === 'superadmin') return;

    const departmentIds = await resolveDeanDepartmentIds(executor, deanUserId);
    if (!departmentIds.length) {
      throw new NotFoundException('Result approval record not found');
    }

    const rows = await executor.query<Array<{ session_id: string }>>(
      `SELECT s.session_id
       FROM exam_result_sessions s
       INNER JOIN academic_courses c ON c.course_id = s.course_id AND c.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND s.session_id = $2
         AND EXISTS (
           SELECT 1
           FROM academic_timetables t
           INNER JOIN users faculty ON faculty.user_id = t.faculty_user_id AND faculty.tenant_id = t.tenant_id
           WHERE t.course_id = c.course_id
             AND t.tenant_id = s.tenant_id
             AND faculty.dept_id = ANY($3::int[])
         )
       LIMIT 1`,
      [tenantId, sessionId, departmentIds],
    );

    if (!rows[0]) {
      // Deliberately indistinguishable from a missing record to avoid turning
      // a request/session UUID into an existence oracle across schools.
      throw new NotFoundException('Result approval record not found');
    }
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
    manager: EntityManager,
  ) {
    await manager.query(
      `INSERT INTO exam_result_dean_approval_history
         (request_id, tenant_id, session_id, actor_user_id, actor_role, action, status, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        requestId,
        tenantId,
        sessionId,
        actorUserId || null,
        actorRole,
        action,
        status,
        comment,
      ],
    );
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
    const updated = await this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertUndeclared(session);

      const marks = await manager.query<
        Array<{
          mark_id: string;
          student_user_id: string;
          marks_obtained: string;
          max_marks: string;
        }>
      >(
        `SELECT mark_id, student_user_id, marks_obtained, max_marks FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'
       ORDER BY mark_id FOR UPDATE`,
        [tenantId, session.course_id, session.exam_type],
      );
      if (!marks.length)
        throw new BadRequestException('No pending marks to adjust');
      await this.invalidateApprovals(
        manager,
        tenantId,
        sessionId,
        actorUserId,
        'Grace marks changed',
      );

      let updated = 0;
      for (const row of marks) {
        const max = Number(row.max_marks ?? session.max_marks);
        const boosted = Math.min(max, Number(row.marks_obtained) + graceMarks);
        await manager.query(
          `UPDATE academic_marks SET marks_obtained = $2, updated_at = NOW()
         WHERE mark_id = $1 AND tenant_id = $3 AND status = 'PENDING_COE'`,
          [row.mark_id, boosted, tenantId],
        );
        updated += 1;
      }

      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_GRACE_MARKS_APPLIED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: { grace_marks: graceMarks, students_updated: updated },
        },
        manager,
      );
      return updated;
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
    const notifications: Array<{
      tenantId: string;
      userId: string;
      courseName: string;
      examType: string;
      actionLink: string;
      message: string;
    }> = [];

    let publication: {
      declared: number;
      course_name: string;
      exam_type: string;
      session_id: string;
    };

    try {
      publication = await this.db.transaction(async (manager) => {
        const session = await this.getDeclarationSession(
          manager,
          tenantId,
          sessionId,
        );
        this.assertReviewable(session);
        const approval = await this.latestApproval(
          manager,
          tenantId,
          sessionId,
        );
        if (!approval || approval.status !== 'APPROVED') {
          throw new BadRequestException(
            'Dean approval is required before publishing results',
          );
        }
        const inputs = await this.approvalInputs(manager, session);
        await this.assertCurrentCoeAudit(manager, session, inputs.state);
        this.assertApprovalMatches(approval, session, inputs.state);
        const bands = inputs.bands;
        const passMarks =
          session.pass_marks != null ? Number(session.pass_marks) : null;

        const marks = inputs.marks;
        if (!marks.length)
          throw new BadRequestException('No PENDING_COE marks to declare');

        const courseName = session.course_name ?? 'Course';
        let declared = 0;

        for (const row of marks) {
          const obtained = Number(row.marks_obtained);
          const max = Number(row.max_marks ?? session.max_marks);
          const percent =
            max > 0 ? Number(((obtained / max) * 100).toFixed(2)) : 0;
          const { grade, gradePoints } = computeGradeFromPercent(
            percent,
            bands,
          );
          const resultStatus = computePassFail(obtained, max, passMarks);
          const summary = `${courseName} ${session.exam_type}: ${obtained}/${max} (${percent}%) — Grade ${grade}`;

          await manager.query(
            `UPDATE academic_marks SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
             WHERE tenant_id = $1 AND mark_id = $2 AND status = 'PENDING_COE'`,
            [tenantId, row.mark_id],
          );

          await this.upsertExamResult(
            manager,
            tenantId,
            row.student_user_id,
            session.course_id,
            session.exam_type,
            obtained,
            max,
            grade,
          );

          await manager.query(
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
            const enrollmentUpdate = await manager.query<
              | Array<{ enrollment_id: string }>
              | [Array<{ enrollment_id: string }>, number]
            >(
              `UPDATE student_course_enrollments
               SET grade = $4, grade_points = $5,
                   status = CASE WHEN $6 = 'PASS' THEN 'COMPLETED' ELSE 'FAILED' END
               WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND semester = $7
                 AND deleted_at IS NULL
               RETURNING enrollment_id`,
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
            const enrollmentRows = Array.isArray(enrollmentUpdate[0])
              ? enrollmentUpdate[0]
              : enrollmentUpdate;
            if (enrollmentRows.length !== 1) {
              throw new BadRequestException(
                'Expected exactly one enrollment grade update for each declared student',
              );
            }
          }

          notifications.push({
            tenantId,
            userId: row.student_user_id,
            courseName,
            examType: session.exam_type,
            actionLink: `/student/marks?report=${sessionId}`,
            message: summary,
          });
          declared += 1;
        }

        const declaredSession = await manager.query<
          | Array<{ session_id: string }>
          | [Array<{ session_id: string }>, number]
        >(
          `UPDATE exam_result_sessions
           SET declared_at = NOW(), declared_by = $3, declaration_note = $4,
               entry_status = 'LOCKED', marks_locked = TRUE, updated_at = NOW()
           WHERE tenant_id = $1 AND session_id = $2 AND declared_at IS NULL
           RETURNING session_id`,
          [
            tenantId,
            sessionId,
            actorUserId,
            dto.declaration_note?.trim() ?? null,
          ],
        );
        const declaredRows = Array.isArray(declaredSession[0])
          ? declaredSession[0]
          : declaredSession;
        if (!declaredRows.length) {
          throw new BadRequestException('Results already declared');
        }
        await this.audit.log(
          tenantId,
          actorUserId,
          {
            action: 'RESULT_DECLARED',
            resource_type: 'exam_result_session',
            resource_id: sessionId,
            new_value: {
              declared,
              outcome: 'SUCCESS',
              approval_request_id: approval.request_id,
              result_state: inputs.state,
            },
          },
          manager,
        );

        return {
          declared,
          course_name: courseName,
          exam_type: session.exam_type,
          session_id: sessionId,
        };
      });
    } catch (error) {
      try {
        await this.audit.log(tenantId, actorUserId, {
          action: 'RESULT_DECLARATION_FAILED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: { outcome: 'FAILED' },
        });
      } catch {
        // ExamCellAuditService follows the existing best-effort audit policy.
      }
      throw error;
    }

    let notificationDispatchFailures = 0;
    for (const notification of notifications) {
      try {
        this.notify.examResultsPublished(notification);
      } catch {
        // The database already committed. A transport/listener error must not
        // report a failed declaration or prevent the remaining dispatches.
        notificationDispatchFailures += 1;
        this.logger.warn(
          `Result publication committed; notification dispatch failed for session ${sessionId}`,
        );
      }
    }

    if (notificationDispatchFailures) {
      try {
        await this.audit.log(tenantId, actorUserId, {
          action: 'RESULT_NOTIFICATION_DISPATCH_FAILED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: {
            outcome: 'PUBLICATION_COMMITTED',
            failed_count: notificationDispatchFailures,
          },
        });
      } catch {
        // Post-commit diagnostics follow the existing best-effort audit policy.
        this.logger.warn(
          `Could not audit notification dispatch failure for session ${sessionId}`,
        );
      }
      return {
        ...publication,
        notification_dispatch_failures: notificationDispatchFailures,
      };
    }
    return publication;
  }

  /** Required compatibility mirror; failures must abort the declaration transaction. */
  private async upsertExamResult(
    executor: DataSource | EntityManager,
    tenantId: string,
    studentUserId: string,
    courseId: string,
    examType: string,
    marksObtained: number,
    maxMarks: number,
    grade: string,
  ) {
    await executor.query(
      `DELETE FROM academic_exam_results
       WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND exam_type = $4`,
      [tenantId, studentUserId, courseId, examType],
    );
    await executor.query(
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
  }

  private assertUndeclared(session: ApprovalSession) {
    if (session.declared_at)
      throw new BadRequestException('Results already declared');
  }

  private assertReviewable(session: ApprovalSession) {
    this.assertUndeclared(session);
    // These inputs are owned by the automatic assessment publisher, not the
    // manual COE submission workflow (same catalogue used by faculty entry).
    if (isAutoSyncedExamType(session.exam_type)) {
      throw new BadRequestException(
        'Auto-synced assessments must use their existing assessment workflow',
      );
    }
    if (!session.marks_locked || session.entry_status !== 'LOCKED') {
      throw new BadRequestException(
        'Close entry and lock marks before result review or declaration',
      );
    }
  }

  private async approvalInputs(
    executor: DataSource | EntityManager,
    session: ApprovalSession,
    lock = true,
  ) {
    let rules: Record<string, unknown> | null = null;
    let policyRevision: string | undefined;
    if (session.grading_policy_id != null) {
      const [policy] = await executor.query<
        Array<{ rules: Record<string, unknown>; revision: string }>
      >(
        `SELECT rules, xmin::text AS revision FROM academic_grading_policies
         WHERE policy_id = $1${lock ? ' FOR SHARE' : ''}`,
        [session.grading_policy_id],
      );
      if (!policy) throw new BadRequestException('Grading policy not found');
      rules = policy.rules;
      policyRevision = policy.revision;
    }
    const bands = parseGradeBands(rules);
    // This is exactly the batch that declaration publishes, not already
    // published assessments or unrelated draft/weekly-test records.
    const marks = await executor.query<ResultApprovalMark[]>(
      `SELECT mark_id, student_user_id, marks_obtained, max_marks, status,
              updated_at::text AS updated_at, xmin::text AS revision
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'
       ORDER BY mark_id${lock ? ' FOR UPDATE' : ''}`,
      [session.tenant_id, session.course_id, session.exam_type],
    );
    if (lock && !marks.length)
      throw new BadRequestException(
        'No PENDING_COE marks to review or declare',
      );

    // Marks are stored by course/exam type, not semester. Never silently filter
    // a mismatched student out of the approved batch. Lock the official roster
    // after marks so an enrollment move/archive cannot race with declaration.
    const studentIds = [...new Set(marks.map((mark) => mark.student_user_id))];
    const enrollments = studentIds.length
      ? await executor.query<
          Array<{ enrollment_id: string; student_user_id: string }>
        >(
          `SELECT enrollment_id, student_user_id FROM student_course_enrollments
           WHERE tenant_id = $1 AND course_id = $2 AND semester = $3
             AND student_user_id = ANY($4::uuid[]) AND deleted_at IS NULL
           ORDER BY enrollment_id${lock ? ' FOR UPDATE' : ''}`,
          [session.tenant_id, session.course_id, session.semester, studentIds],
        )
      : [];
    // Do not require ENROLLED here: an earlier declared assessment may already
    // have set COMPLETED/FAILED. This check establishes scope, not a new policy.
    const enrolledStudents = new Set(
      enrollments.map((enrollment) => enrollment.student_user_id),
    );
    const rosterValid =
      enrollments.length === studentIds.length &&
      studentIds.every((studentId) => enrolledStudents.has(studentId));
    if (lock && !rosterValid) {
      throw new BadRequestException(
        'Result batch contains students without a matching course enrollment for this semester',
      );
    }
    return {
      marks,
      bands,
      rosterValid,
      state: resultApprovalState(
        session,
        marks,
        { rules, bands },
        policyRevision,
      ),
    };
  }

  private async latestApproval(
    executor: DataSource | EntityManager,
    tenantId: string,
    sessionId: string,
  ) {
    const [request] = await executor.query<ApprovalRequest[]>(
      `SELECT request_id, session_id, tenant_id, status, request_summary
       FROM exam_result_dean_approval_requests
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY requested_at DESC, request_id DESC LIMIT 1`,
      [requireTenantId(tenantId), sessionId],
    );
    return request;
  }

  private async latestCoeAudit(
    executor: DataSource | EntityManager,
    tenantId: string,
    sessionId: string,
  ) {
    const [event] = await executor.query<
      Array<{ action: string; new_value: Record<string, unknown> | null }>
    >(
      `SELECT action, new_value FROM exam_audit_logs
       WHERE tenant_id = $1 AND resource_id = $2 AND resource_type = 'exam_result_session'
         AND action IN ('RESULT_COE_AUDIT_PASSED', 'RESULT_COE_AUDIT_ANOMALY', 'RESULT_INPUTS_CHANGED')
       ORDER BY created_at DESC, audit_id DESC LIMIT 1`,
      [tenantId, sessionId],
    );
    return event;
  }

  private async assertCurrentCoeAudit(
    manager: EntityManager,
    session: ApprovalSession,
    state: ResultApprovalState,
  ) {
    const event = await this.latestCoeAudit(
      manager,
      session.tenant_id,
      session.session_id,
    );
    if (
      event?.action !== 'RESULT_COE_AUDIT_PASSED' ||
      !matchesResultApprovalState(event.new_value?.result_state, state)
    ) {
      throw new BadRequestException(
        'A passing COE formula audit for the current marks and rules is required',
      );
    }
  }

  private assertApprovalMatches(
    request: ApprovalRequest,
    session: ApprovalSession,
    state: ResultApprovalState,
  ) {
    if (
      request.tenant_id !== session.tenant_id ||
      request.session_id !== session.session_id ||
      !matchesResultApprovalState(request.request_summary?.result_state, state)
    ) {
      throw new BadRequestException(
        'Dean approval is stale or unverified. Request fresh review of the current marks and rules.',
      );
    }
  }

  private async invalidateApprovals(
    manager: EntityManager,
    tenantId: string,
    sessionId: string,
    actorUserId: string | undefined,
    reason: string,
  ) {
    const result = await manager.query<
      Array<{ request_id: string }> | [Array<{ request_id: string }>, number]
    >(
      `UPDATE exam_result_dean_approval_requests
       SET status = 'REJECTED', decision_comment = $3, decided_by = NULL, decided_at = NULL,
           request_summary = COALESCE(request_summary, '{}'::jsonb) ||
             jsonb_build_object('invalidated_at', clock_timestamp(), 'invalidation_reason', $3::text),
           updated_at = clock_timestamp()
       WHERE tenant_id = $1 AND session_id = $2 AND status IN ('PENDING', 'APPROVED')
       RETURNING request_id`,
      [tenantId, sessionId, `Invalidated: ${reason}`],
    );
    // The PostgreSQL driver returns UPDATE results as [rows, affectedCount].
    const invalidated = (
      Array.isArray(result[0]) ? result[0] : result
    ) as Array<{
      request_id: string;
    }>;
    for (const request of invalidated) {
      await this.appendDeanApprovalHistory(
        tenantId,
        request.request_id,
        sessionId,
        actorUserId ?? '',
        'System',
        'INVALIDATED',
        'REJECTED',
        reason,
        manager,
      );
    }
    if (invalidated.length) {
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_APPROVALS_INVALIDATED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: { reason, requests: invalidated.length },
        },
        manager,
      );
    }
  }

  private async editSession(
    tenantId: string,
    sessionId: string,
    actorUserId: string | undefined,
    reason: string,
    change: (manager: EntityManager, session: ApprovalSession) => Promise<void>,
  ) {
    await this.db.transaction(async (manager) => {
      const session = await this.getDeclarationSession(
        manager,
        tenantId,
        sessionId,
      );
      this.assertUndeclared(session);
      await this.invalidateApprovals(
        manager,
        tenantId,
        sessionId,
        actorUserId,
        reason,
      );
      await change(manager, session);
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_INPUTS_CHANGED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: { reason },
        },
        manager,
      );
    });
  }

  private async lockSessionMarks(
    manager: EntityManager,
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    await manager.query(
      `UPDATE exam_result_sessions
       SET entry_status = 'LOCKED', marks_locked = TRUE, marks_locked_at = clock_timestamp(),
           marks_locked_by = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, sessionId, actorUserId],
    );
  }

  private async getDeclarationSession(
    manager: EntityManager,
    tenantId: string,
    sessionId: string,
  ) {
    tenantId = requireTenantId(tenantId);
    const [scope] = await manager.query<
      Array<{ course_id: string; exam_type: string }>
    >(
      `SELECT course_id, exam_type FROM exam_result_sessions
       WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, sessionId],
    );
    if (!scope) throw new NotFoundException('Result session not found');
    await lockResultInputs(manager, tenantId, scope.course_id, scope.exam_type);
    const rows = await manager.query<ApprovalSession[]>(
      `SELECT s.*, c.course_code, c.course_name, gp.policy_name AS grading_policy_name
       FROM exam_result_sessions s
       JOIN academic_courses c ON c.course_id = s.course_id AND c.tenant_id = s.tenant_id
       LEFT JOIN academic_grading_policies gp ON gp.policy_id = s.grading_policy_id
       WHERE s.tenant_id = $1 AND s.session_id = $2
       FOR UPDATE OF s`,
      [tenantId, sessionId],
    );
    if (!rows[0]) throw new NotFoundException('Result session not found');
    return rows[0];
  }

  async getSessionForCourse(
    tenantId: string,
    courseId: string,
    examType: string,
    semester?: number,
  ) {
    const params: unknown[] = [tenantId, courseId, examType];
    const semesterFilter =
      semester == null ? '' : ` AND semester = $${params.push(semester)}`;
    const rows = await this.db.query(
      `SELECT * FROM exam_result_sessions
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3${semesterFilter}
       ORDER BY created_at DESC LIMIT 1`,
      params,
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

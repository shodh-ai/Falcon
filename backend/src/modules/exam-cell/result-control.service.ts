import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';
import { isEndSemesterExamType } from '../academics/marks-publication-policy';
import { invalidateOfficialTranscripts } from './official-transcript-revisions';
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

type WorkflowDatabase = Pick<EntityManager, 'query'>;
type WorkflowMark = {
  mark_id: string;
  student_user_id: string;
  marks_obtained: string;
  max_marks: string;
  status: string;
};
type WorkflowSnapshot = {
  session_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  semester: number;
  max_marks: number;
  pass_marks: number | null;
  grading_policy_id: number | null;
  grading_rules: Record<string, unknown> | null;
  owner_department_id: number | null;
  entry_revision: number;
  entry_status: string;
  marks_locked: boolean;
  declared_at: Date | null;
  marks: WorkflowMark[];
  input_hash: string;
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

@Injectable()
export class ResultControlService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly audit: ExamCellAuditService,
  ) {}

  private async workflowSnapshot(
    db: WorkflowDatabase,
    tenantId: string,
    sessionId: string,
    lock = false,
  ): Promise<WorkflowSnapshot> {
    const sessions = await db.query<
      Array<Omit<WorkflowSnapshot, 'marks' | 'input_hash'>>
    >(
      `SELECT s.session_id, s.course_id,c.course_code,c.course_name, s.exam_type, s.semester, s.max_marks, s.pass_marks, s.owner_department_id, s.entry_revision,
              s.grading_policy_id, gp.rules AS grading_rules, s.entry_status, s.marks_locked, s.declared_at
       FROM exam_result_sessions s JOIN academic_courses c ON c.course_id=s.course_id AND c.tenant_id=s.tenant_id LEFT JOIN academic_grading_policies gp ON gp.policy_id=s.grading_policy_id
       WHERE s.tenant_id=$1 AND s.session_id=$2${lock ? ' FOR UPDATE OF s' : ''}`,
      [tenantId, sessionId],
    );
    const session = sessions[0];
    if (!session) throw new NotFoundException('Result session not found');
    const marks = await db.query<WorkflowMark[]>(
      `SELECT mark_id, student_user_id, marks_obtained, max_marks, status FROM academic_marks
       WHERE tenant_id=$1 AND course_id=$2 AND exam_type=$3 AND status IN ('PENDING_COE','PUBLISHED')
       ORDER BY mark_id${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, session.course_id, session.exam_type],
    );
    const input_hash = createHash('sha256')
      .update(
        JSON.stringify(
          canonical({
            tenantId,
            sessionId,
            course_id: session.course_id,
            exam_type: session.exam_type,
            semester: session.semester,
            max_marks: Number(session.max_marks),
            pass_marks:
              session.pass_marks == null ? null : Number(session.pass_marks),
            grading_policy_id: session.grading_policy_id,
            grading_rules: session.grading_rules,
            owner_department_id: session.owner_department_id,
            entry_revision: session.entry_revision,
            marks: marks.map((m) => ({
              mark_id: m.mark_id,
              student_user_id: m.student_user_id,
              marks_obtained: Number(m.marks_obtained),
              max_marks: Number(m.max_marks),
            })),
          }),
        ),
      )
      .digest('hex');
    return { ...session, marks, input_hash };
  }

  private assertUnpublished(session: { declared_at: Date | null }) {
    if (session.declared_at)
      throw new BadRequestException('Declared result sessions are immutable');
  }

  private assertLocked(session: WorkflowSnapshot) {
    if (!session.marks_locked || session.entry_status !== 'LOCKED')
      throw new BadRequestException(
        'Close and lock marks entry before result review or publication',
      );
  }

  private async latestCoeAudit(
    db: WorkflowDatabase,
    tenantId: string,
    sessionId: string,
  ) {
    const rows = await db.query<
      Array<{ action: string; new_value: { input_hash?: string } | null }>
    >(
      `SELECT action,new_value FROM exam_audit_logs WHERE tenant_id=$1 AND resource_id=$2
       AND action IN ('RESULT_COE_AUDIT_PASSED','RESULT_COE_AUDIT_ANOMALY','RESULT_COE_AUDIT_INVALIDATED')
       ORDER BY created_at DESC,audit_id DESC LIMIT 1`,
      [tenantId, sessionId],
    );
    return rows[0];
  }

  private async assertCurrentCoeAudit(
    db: WorkflowDatabase,
    tenantId: string,
    sessionId: string,
    hash: string,
  ) {
    const audit = await this.latestCoeAudit(db, tenantId, sessionId);
    if (
      audit?.action !== 'RESULT_COE_AUDIT_PASSED' ||
      audit.new_value?.input_hash !== hash
    )
      throw new BadRequestException(
        'A current COE formula audit must pass for the exact marks and rules before review or publication',
      );
  }

  private async invalidateApprovals(
    db: WorkflowDatabase,
    tenantId: string,
    sessionId: string,
    reason: string,
    actorUserId?: string,
  ) {
    await db.query(
      `UPDATE exam_result_dean_approval_requests SET
       status=CASE WHEN status='PENDING' THEN 'REJECTED' ELSE status END,
       request_summary=COALESCE(request_summary,'{}'::jsonb)||jsonb_build_object('invalidated_at',NOW()::text,'invalidation_reason',$3::text),
       decision_comment=CASE WHEN status='PENDING' THEN $3::text ELSE decision_comment END,updated_at=NOW()
       WHERE tenant_id=$1 AND session_id=$2 AND status IN ('PENDING','APPROVED')
         AND request_summary->>'invalidated_at' IS NULL`,
      [tenantId, sessionId, reason],
    );
    await this.audit.log(
      tenantId,
      actorUserId,
      {
        action: 'RESULT_COE_AUDIT_INVALIDATED',
        resource_type: 'exam_result_session',
        resource_id: sessionId,
        new_value: { reason },
      },
      db,
    );
  }

  private async mutateUnpublished(
    tenantId: string,
    sessionId: string,
    reason: string,
    work: (db: WorkflowDatabase) => Promise<void>,
    actorUserId?: string,
  ) {
    await this.db.transaction(async (tx) => {
      this.assertUnpublished(
        await this.workflowSnapshot(tx, tenantId, sessionId, true),
      );
      await work(tx);
      await this.invalidateApprovals(
        tx,
        tenantId,
        sessionId,
        reason,
        actorUserId,
      );
    });
    return this.getSession(tenantId, sessionId);
  }

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
    const snapshot = await this.workflowSnapshot(this.db, tenantId, sessionId);
    const audit = await this.latestCoeAudit(this.db, tenantId, sessionId);
    const currentAudit = audit?.new_value?.input_hash === snapshot.input_hash;
    const coe_audit_status =
      currentAudit && audit?.action === 'RESULT_COE_AUDIT_PASSED'
        ? 'passed'
        : currentAudit && audit?.action === 'RESULT_COE_AUDIT_ANOMALY'
          ? 'anomaly'
          : 'idle';
    const approvals = await this.db.query<
      Array<{
        status: string;
        request_summary: {
          input_hash?: string;
          invalidated_at?: string;
        } | null;
      }>
    >(
      `SELECT status,request_summary FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2
       ORDER BY requested_at DESC,created_at DESC,request_id DESC LIMIT 1`,
      [tenantId, sessionId],
    );
    const latest = approvals[0];
    const current =
      !!latest &&
      !latest.request_summary?.invalidated_at &&
      latest.request_summary?.input_hash === snapshot.input_hash;
    const hodRows = isEndSemesterExamType(snapshot.exam_type)
      ? await this.db.query<Array<{ decision: string; input_hash: string }>>(
          `SELECT decision,input_hash FROM exam_result_hod_decisions
           WHERE tenant_id=$1 AND session_id=$2
           ORDER BY decided_at DESC,decision_id DESC LIMIT 1`,
          [tenantId, sessionId],
        )
      : [];
    const hodCurrent = hodRows[0]?.input_hash === snapshot.input_hash;
    return {
      coe_audit_status,
      dean_approved: current && latest.status === 'APPROVED',
      dean_approval_status: current ? latest.status : null,
      hod_approved: hodCurrent && hodRows[0]?.decision === 'APPROVED',
      hod_approval_status: hodCurrent ? hodRows[0]?.decision : null,
    };
  }

  /** Exam Cell must choose one department with an active HOD for an end-term session. */
  async listEndTermDepartments(tenantId: string, courseId: string) {
    return this.db.query<Array<{ dept_id: number; dept_name: string }>>(
      `SELECT d.dept_id, d.dept_name
       FROM departments d
       JOIN users hod ON hod.user_id = d.hod_user_id
         AND hod.tenant_id = $1 AND hod.is_active = TRUE AND hod.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM student_course_enrollments e
           JOIN users student ON student.user_id = e.student_user_id
           WHERE e.tenant_id = $1 AND e.course_id = $2
             AND e.deleted_at IS NULL AND e.status IN ('ENROLLED','COMPLETED','FAILED')
             AND student.tenant_id = $1 AND student.dept_id = d.dept_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM student_course_enrollments e
           JOIN users student ON student.user_id = e.student_user_id
           WHERE e.tenant_id = $1 AND e.course_id = $2 AND e.deleted_at IS NULL
             AND e.status IN ('ENROLLED','COMPLETED','FAILED')
             AND (student.tenant_id IS DISTINCT FROM $1::uuid OR student.dept_id IS DISTINCT FROM d.dept_id)
         )
       ORDER BY d.dept_name`,
      [tenantId, courseId],
    );
  }

  async createSession(
    tenantId: string,
    dto: CreateResultSessionDto,
    actorUserId?: string,
  ) {
    const courseRows = await this.db.query(
      `SELECT course_id FROM academic_courses WHERE course_id = $1 AND tenant_id = $2`,
      [dto.course_id, tenantId],
    );
    if (!courseRows[0]) throw new BadRequestException('Course not found');
    if (isEndSemesterExamType(dto.exam_type)) {
      if (!dto.owner_department_id) {
        throw new BadRequestException('Select the concerned department before opening end-semester marks entry');
      }
      const departments = await this.listEndTermDepartments(tenantId, dto.course_id);
      if (!departments.some((department) => department.dept_id === dto.owner_department_id)) {
        throw new BadRequestException('The selected department has no eligible HOD and course scope');
      }
    }

    const rows = await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `result-session-config:${tenantId}:${dto.course_id}:${dto.exam_type}`,
      ]);
      if (isEndSemesterExamType(dto.exam_type)) {
        const ambiguous = await tx.query<Array<{ session_id: string }>>(
          `SELECT session_id FROM exam_result_sessions
           WHERE tenant_id=$1 AND course_id=$2 AND exam_type=$3 AND semester<>$4 LIMIT 1`,
          [tenantId, dto.course_id, dto.exam_type, dto.semester ?? 4],
        );
        if (ambiguous[0]) {
          throw new BadRequestException('This course already has another end-semester session. Use a distinct term-specific course identity before creating a new session.');
        }
      }
      const previous = await tx.query<Array<{ session_id: string }>>(
        'SELECT session_id FROM exam_result_sessions WHERE tenant_id=$1 AND course_id=$2 AND exam_type=$3 AND semester=$4 FOR UPDATE',
        [tenantId, dto.course_id, dto.exam_type, dto.semester ?? 4],
      );
      const before = previous[0]
        ? await this.workflowSnapshot(tx, tenantId, previous[0].session_id)
        : null;
      if (before) this.assertUnpublished(before);
      const result = await tx.query<Array<{ session_id: string }>>(
        `INSERT INTO exam_result_sessions (
         tenant_id, course_id, exam_type, semester, max_marks, pass_marks, grading_policy_id, owner_department_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, course_id, exam_type, semester) DO UPDATE SET
         max_marks = EXCLUDED.max_marks,
         pass_marks = COALESCE(EXCLUDED.pass_marks, exam_result_sessions.pass_marks),
         grading_policy_id = COALESCE(EXCLUDED.grading_policy_id, exam_result_sessions.grading_policy_id),
         owner_department_id = EXCLUDED.owner_department_id,
         updated_at = NOW()
       WHERE exam_result_sessions.declared_at IS NULL
       RETURNING *`,
        [
          tenantId,
          dto.course_id,
          dto.exam_type,
          dto.semester ?? 4,
          dto.max_marks ?? 100,
          dto.pass_marks ?? null,
          dto.grading_policy_id ?? null,
          isEndSemesterExamType(dto.exam_type) ? dto.owner_department_id : null,
        ],
      );
      if (!result[0])
        throw new BadRequestException('Declared result sessions are immutable');
      const after = await this.workflowSnapshot(
        tx,
        tenantId,
        result[0].session_id,
      );
      if (before && before.input_hash !== after.input_hash)
        await this.invalidateApprovals(
          tx,
          tenantId,
          result[0].session_id,
          'Result session configuration changed',
          actorUserId,
        );
      return result;
    });
    return this.getSession(tenantId, rows[0].session_id);
  }

  async openEntry(
    tenantId: string,
    sessionId: string,
    dto: OpenResultEntryDto,
    actorUserId?: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (isEndSemesterExamType(session.exam_type)) {
      const departments = await this.listEndTermDepartments(tenantId, session.course_id);
      if (!session.owner_department_id || !departments.some((department) => department.dept_id === session.owner_department_id)) {
        throw new BadRequestException('Assign a concerned department with an active HOD and reconciled roster before opening end-semester marks entry');
      }
    }
    return this.mutateUnpublished(
      tenantId,
      sessionId,
      'Marks entry opened',
      async (tx) => {
        await tx.query(
          `UPDATE exam_result_sessions SET entry_status='OPEN',entry_open_at=COALESCE($2::timestamptz,NOW()),
        entry_close_at=$3::timestamptz,marks_locked=FALSE,marks_locked_at=NULL,marks_locked_by=NULL,reopen_reason=NULL,updated_at=NOW()
        WHERE session_id=$1 AND tenant_id=$4`,
          [
            sessionId,
            dto.entry_open_at ?? null,
            dto.entry_close_at ?? null,
            tenantId,
          ],
        );
      },
      actorUserId,
    );
  }

  async closeEntry(tenantId: string, sessionId: string) {
    this.assertUnpublished(await this.getSession(tenantId, sessionId));
    const rows = await this.db.query<Array<{ session_id: string }>>(
      `UPDATE exam_result_sessions SET entry_status='CLOSED',updated_at=NOW() WHERE session_id=$1 AND tenant_id=$2 AND declared_at IS NULL RETURNING session_id`,
      [sessionId, tenantId],
    );
    if (!rows[0])
      throw new BadRequestException('Declared result sessions are immutable');
    return this.getSession(tenantId, sessionId);
  }

  async lockMarks(tenantId: string, sessionId: string, actorUserId: string) {
    this.assertUnpublished(await this.getSession(tenantId, sessionId));
    const rows = await this.db.query<Array<{ session_id: string }>>(
      `UPDATE exam_result_sessions SET entry_status='LOCKED',marks_locked=TRUE,marks_locked_at=NOW(),marks_locked_by=$2,updated_at=NOW()
      WHERE session_id=$1 AND tenant_id=$3 AND declared_at IS NULL RETURNING session_id`,
      [sessionId, actorUserId, tenantId],
    );
    if (!rows[0])
      throw new BadRequestException('Declared result sessions are immutable');
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
    actorUserId?: string,
  ) {
    const session = await this.getSession(tenantId, sessionId);
    if (isEndSemesterExamType(session.exam_type)) {
      const departments = await this.listEndTermDepartments(tenantId, session.course_id);
      if (!session.owner_department_id || !departments.some((department) => department.dept_id === session.owner_department_id)) {
        throw new BadRequestException('End-semester marks require a current concerned department and HOD');
      }
    }
    return this.mutateUnpublished(
      tenantId,
      sessionId,
      'Marks entry reopened: ' + dto.reason.trim(),
      async (tx) => {
        await tx.query(
          `UPDATE exam_result_sessions SET entry_status='OPEN',marks_locked=FALSE,marks_locked_at=NULL,
        entry_revision=entry_revision+1,
        marks_locked_by=NULL,reopen_reason=$2,updated_at=NOW() WHERE session_id=$1 AND tenant_id=$3`,
          [sessionId, dto.reason.trim(), tenantId],
        );
        await tx.query(
          `UPDATE academic_marks SET status='DRAFT',updated_at=NOW()
        WHERE tenant_id=$1 AND course_id=(SELECT course_id FROM exam_result_sessions WHERE session_id=$2 AND tenant_id=$1)
          AND exam_type=(SELECT exam_type FROM exam_result_sessions WHERE session_id=$2 AND tenant_id=$1) AND status='PENDING_COE'`,
          [tenantId, sessionId],
        );
      },
      actorUserId,
    );
  }

  async configureRules(
    tenantId: string,
    sessionId: string,
    dto: ConfigureSessionRulesDto,
    actorUserId?: string,
  ) {
    return this.mutateUnpublished(
      tenantId,
      sessionId,
      'Result grading rules changed',
      async (tx) => {
        await tx.query(
          `UPDATE exam_result_sessions SET pass_marks=COALESCE($2,pass_marks),grading_policy_id=COALESCE($3,grading_policy_id),
        max_marks=COALESCE($4,max_marks),updated_at=NOW() WHERE session_id=$1 AND tenant_id=$5`,
          [
            sessionId,
            dto.pass_marks ?? null,
            dto.grading_policy_id ?? null,
            dto.max_marks ?? null,
            tenantId,
          ],
        );
      },
      actorUserId,
    );
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
    return this.db.transaction(async (tx) => {
      const snapshot = await this.workflowSnapshot(
        tx,
        tenantId,
        sessionId,
        true,
      );
      this.assertUnpublished(snapshot);
      this.assertLocked(snapshot);
      if (!snapshot.marks.length)
        throw new BadRequestException('No marks to audit');
      const failing = snapshot.marks.filter((row) => {
        const obtained = Number(row.marks_obtained),
          max = Number(row.max_marks ?? snapshot.max_marks);
        return snapshot.pass_marks != null
          ? obtained < Number(snapshot.pass_marks)
          : max > 0 && (obtained / max) * 100 < 40;
      }).length;
      const rate = failing / snapshot.marks.length,
        passed = rate < 0.5;
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: passed
            ? 'RESULT_COE_AUDIT_PASSED'
            : 'RESULT_COE_AUDIT_ANOMALY',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: {
            failure_rate: Math.round(rate * 100),
            failing,
            total: snapshot.marks.length,
            input_hash: snapshot.input_hash,
          },
        },
        tx,
      );
      return {
        status: passed ? 'passed' : 'anomaly',
        failure_rate: Math.round(rate * 100),
        anomaly_subjects: passed
          ? []
          : [
              {
                course_code: snapshot.course_code,
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
    const session = await this.getSession(tenantId, sessionId);
    if (isEndSemesterExamType(session.exam_type)) {
      throw new BadRequestException('End-semester results require the concerned department HOD, not Dean approval');
    }
    let created = false;
    const request = await this.db.transaction(async (tx) => {
      const snapshot = await this.workflowSnapshot(
        tx,
        tenantId,
        sessionId,
        true,
      );
      this.assertUnpublished(snapshot);
      this.assertLocked(snapshot);
      await this.assertCurrentCoeAudit(
        tx,
        tenantId,
        sessionId,
        snapshot.input_hash,
      );
      const pending = snapshot.marks.filter(
        (m) => m.status === 'PENDING_COE',
      ).length;
      if (!pending)
        throw new BadRequestException(
          'No faculty submissions awaiting declaration',
        );
      const existing = await tx.query<
        Array<{
          request_id: string;
          request_summary: {
            input_hash?: string;
            invalidated_at?: string;
          } | null;
        }>
      >(
        `SELECT request_id,request_summary FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2 AND status='PENDING' FOR UPDATE`,
        [tenantId, sessionId],
      );
      if (
        existing[0] &&
        !existing[0].request_summary?.invalidated_at &&
        existing[0].request_summary?.input_hash === snapshot.input_hash
      )
        return { request_id: existing[0].request_id, status: 'PENDING' };
      if (existing[0])
        await tx.query(
          `UPDATE exam_result_dean_approval_requests SET status='REJECTED',request_summary=COALESCE(request_summary,'{}'::jsonb)||jsonb_build_object('invalidated_at',NOW()::text,'invalidation_reason','Review inputs changed'),updated_at=NOW() WHERE tenant_id=$1 AND request_id=$2`,
          [tenantId, existing[0].request_id],
        );
      const summary = {
        course_code: session.course_code,
        course_name: session.course_name,
        exam_type: snapshot.exam_type,
        semester: snapshot.semester,
        pending_marks: pending,
        input_hash: snapshot.input_hash,
      };
      const rows = await tx.query<
        Array<{ request_id: string; status: string; requested_at: Date }>
      >(
        `INSERT INTO exam_result_dean_approval_requests(tenant_id,session_id,status,requested_by,request_summary) VALUES($1,$2,'PENDING',$3,$4::jsonb) RETURNING request_id,status,requested_at`,
        [tenantId, sessionId, actorUserId, JSON.stringify(summary)],
      );
      const request = rows[0];
      created = true;
      await this.appendDeanApprovalHistory(
        tenantId,
        request.request_id,
        sessionId,
        actorUserId,
        'ExamCell',
        'REQUESTED',
        'PENDING',
        null,
        tx,
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
        tx,
      );
      return request;
    });
    if (created) {
      const deans = await this.db.query<Array<{ user_id: string }>>(
        `SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.tenant_id=$1 AND r.role_name='Dean'`,
        [tenantId],
      );
      for (const dean of deans)
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

  private deanCourseScope(tenant: string, course: string, departments: string) {
    return `EXISTS(SELECT 1 FROM users faculty WHERE faculty.tenant_id=${tenant} AND faculty.dept_id=ANY(${departments}::int[])
      AND (EXISTS(SELECT 1 FROM academic_timetables t WHERE t.tenant_id=faculty.tenant_id AND t.faculty_user_id=faculty.user_id AND t.course_id=${course} AND t.deleted_at IS NULL)
        OR EXISTS(SELECT 1 FROM academic_course_allocations allocation WHERE allocation.tenant_id=faculty.tenant_id AND allocation.faculty_user_id=faculty.user_id AND allocation.course_id=${course} AND allocation.status='ACTIVE')))`;
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
       WHERE r.tenant_id = $1 AND r.status = 'PENDING'
         AND ${this.deanCourseScope('r.tenant_id', 's.course_id', '$2')}${searchSql}`,
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
         AND ${this.deanCourseScope('r.tenant_id', 's.course_id', '$2')}${searchSql}
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
    if (!['APPROVED', 'REJECTED'].includes(decision))
      throw new BadRequestException('A valid Dean decision is required');
    const departments =
      actorRole === 'SuperAdmin' || actorRole === 'Admin'
        ? null
        : await resolveDeanDepartmentIds(this.db, deanUserId);
    if (departments && !departments.length)
      throw new NotFoundException(
        'Pending result approval request not found in your department scope',
      );
    return this.db.transaction(async (tx) => {
      const ids = await tx.query<Array<{ session_id: string }>>(
        `SELECT r.session_id FROM exam_result_dean_approval_requests r
        JOIN exam_result_sessions s ON s.session_id=r.session_id AND s.tenant_id=r.tenant_id
        WHERE r.tenant_id=$1 AND r.request_id=$2 AND r.status='PENDING'
          AND ($3::int[] IS NULL OR ${this.deanCourseScope('r.tenant_id', 's.course_id', '$3')})`,
        [tenantId, requestId, departments],
      );
      if (!ids[0])
        throw new NotFoundException(
          'Pending result approval request not found in your department scope',
        );
      const snapshot = await this.workflowSnapshot(
        tx,
        tenantId,
        ids[0].session_id,
        true,
      );
      this.assertUnpublished(snapshot);
      this.assertLocked(snapshot);
      const requests = await tx.query<
        Array<{
          request_id: string;
          status: string;
          request_summary: {
            input_hash?: string;
            invalidated_at?: string;
          } | null;
        }>
      >(
        `SELECT request_id,status,request_summary FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2 ORDER BY requested_at DESC,created_at DESC,request_id DESC LIMIT 1 FOR UPDATE`,
        [tenantId, ids[0].session_id],
      );
      const pending = requests[0];
      if (
        pending?.request_id !== requestId ||
        pending.status !== 'PENDING' ||
        pending.request_summary?.invalidated_at ||
        pending.request_summary?.input_hash !== snapshot.input_hash
      )
        throw new BadRequestException(
          'Approval inputs changed. Request a new COE audit and Dean review',
        );
      await this.assertCurrentCoeAudit(
        tx,
        tenantId,
        snapshot.session_id,
        snapshot.input_hash,
      );
      await tx.query(
        `UPDATE exam_result_dean_approval_requests SET status=$3,decided_by=$4,decided_at=NOW(),decision_comment=$5,updated_at=NOW() WHERE tenant_id=$1 AND request_id=$2`,
        [tenantId, requestId, decision, deanUserId, comment?.trim() ?? null],
      );
      await this.appendDeanApprovalHistory(
        tenantId,
        requestId,
        snapshot.session_id,
        deanUserId,
        actorRole,
        decision,
        decision,
        comment?.trim() ?? null,
        tx,
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
          resource_id: snapshot.session_id,
          new_value: {
            comment: comment?.trim() ?? null,
            decision,
            input_hash: snapshot.input_hash,
          },
        },
        tx,
      );
      return {
        request_id: requestId,
        session_id: snapshot.session_id,
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

  private async assertDeanCanAccessResultSession(
    tenantId: string,
    deanUserId: string,
    sessionId: string,
    actorRole: string,
  ) {
    if (actorRole.trim().toLowerCase() === 'superadmin') return;
    const departmentIds = await resolveDeanDepartmentIds(this.db, deanUserId);
    if (!departmentIds.length) {
      throw new NotFoundException('Result approval record not found');
    }
    const rows = await this.db.query<Array<{ session_id: string }>>(
      `SELECT s.session_id
       FROM exam_result_sessions s
       INNER JOIN academic_courses c ON c.course_id = s.course_id
       WHERE s.tenant_id = $1
         AND s.session_id = $2
         AND EXISTS (
           SELECT 1
           FROM academic_timetables t
           INNER JOIN users faculty ON faculty.user_id = t.faculty_user_id
           WHERE t.course_id = c.course_id
             AND t.tenant_id = s.tenant_id
             AND faculty.dept_id = ANY($3::int[])
         )
       LIMIT 1`,
      [tenantId, sessionId, departmentIds],
    );
    if (!rows[0]) {
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
    db: WorkflowDatabase = this.db,
  ) {
    await db.query(
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
    );
  }

  async applySessionGraceMarks(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
    graceMarks: number,
  ) {
    if (!Number.isFinite(graceMarks) || graceMarks <= 0)
      throw new BadRequestException('Grace marks must be a positive number');
    const updated = await this.db.transaction(async (tx) => {
      const snapshot = await this.workflowSnapshot(
        tx,
        tenantId,
        sessionId,
        true,
      );
      this.assertUnpublished(snapshot);
      const marks = snapshot.marks.filter((m) => m.status === 'PENDING_COE');
      if (!marks.length)
        throw new BadRequestException('No pending marks to adjust');
      for (const row of marks)
        await tx.query(
          'UPDATE academic_marks SET marks_obtained=$2,updated_at=NOW() WHERE mark_id=$1 AND tenant_id=$3',
          [
            row.mark_id,
            Math.min(
              Number(row.max_marks ?? snapshot.max_marks),
              Number(row.marks_obtained) + graceMarks,
            ),
            tenantId,
          ],
        );
      await this.invalidateApprovals(
        tx,
        tenantId,
        sessionId,
        'Grace marks changed review inputs',
        actorUserId,
      );
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'RESULT_GRACE_MARKS_APPLIED',
          resource_type: 'exam_result_session',
          resource_id: sessionId,
          new_value: {
            grace_marks: graceMarks,
            students_updated: marks.length,
          },
        },
        tx,
      );
      return marks.length;
    });
    const processed = await this.processSession(
      tenantId,
      sessionId,
      actorUserId,
    );
    return { updated, preview: processed.preview };
  }

  async listHodEndTermSessions(tenantId: string, hodUserId: string) {
    return this.db.query(
      `SELECT s.session_id, s.course_id, s.exam_type, s.semester, s.max_marks,
              s.entry_status, s.owner_department_id, c.course_code, c.course_name,
              COUNT(m.mark_id)::int AS submitted_marks
       FROM exam_result_sessions s
       JOIN academic_courses c ON c.course_id = s.course_id AND c.tenant_id = s.tenant_id
       JOIN departments d ON d.dept_id = s.owner_department_id AND d.hod_user_id = $2
       JOIN users hod ON hod.user_id = d.hod_user_id AND hod.tenant_id = $1
         AND hod.is_active = TRUE AND hod.deleted_at IS NULL
       JOIN academic_marks m ON m.tenant_id = s.tenant_id AND m.course_id = s.course_id
         AND m.exam_type = s.exam_type AND m.status = 'PENDING_COE'
       WHERE s.tenant_id = $1 AND s.exam_type IN ('ETE', 'END_TERM')
         AND s.declared_at IS NULL
       GROUP BY s.session_id, c.course_code, c.course_name
       ORDER BY c.course_code, s.semester`,
      [tenantId, hodUserId],
    );
  }

  private async assertHodOwnsSession(
    db: WorkflowDatabase,
    tenantId: string,
    sessionId: string,
    hodUserId: string,
  ) {
    const rows = await db.query<Array<{ department_id: number }>>(
      `SELECT d.dept_id AS department_id
       FROM exam_result_sessions s
       JOIN departments d ON d.dept_id = s.owner_department_id
       JOIN users hod ON hod.user_id = d.hod_user_id
       WHERE s.tenant_id = $1 AND s.session_id = $2 AND d.hod_user_id = $3
         AND hod.tenant_id = $1 AND hod.is_active = TRUE AND hod.deleted_at IS NULL
         AND s.exam_type IN ('ETE', 'END_TERM') AND s.declared_at IS NULL`,
      [tenantId, sessionId, hodUserId],
    );
    if (!rows[0]) throw new NotFoundException('End-semester review not found in your department');
    return rows[0].department_id;
  }

  async getHodEndTermSession(tenantId: string, sessionId: string, hodUserId: string) {
    const departmentId = await this.assertHodOwnsSession(this.db, tenantId, sessionId, hodUserId);
    const snapshot = await this.workflowSnapshot(this.db, tenantId, sessionId);
    const marks = await this.db.query(
      `SELECT m.student_user_id, u.name AS student_name,
              COALESCE(NULLIF(BTRIM(enrollment.roll_number),''),
                NULLIF(BTRIM(sp.student_login_id),''), NULLIF(BTRIM(sp.prn_number),''),
                m.student_user_id::text) AS roll_number,
              m.marks_obtained,
              m.max_marks, m.status, m.uploaded_by
       FROM academic_marks m JOIN users u ON u.user_id = m.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN LATERAL (
         SELECT e.roll_number FROM student_course_enrollments e
         WHERE e.tenant_id=m.tenant_id AND e.course_id=m.course_id
           AND e.student_user_id=m.student_user_id AND e.deleted_at IS NULL
         ORDER BY e.semester DESC LIMIT 1
       ) enrollment ON TRUE
       WHERE m.tenant_id = $1 AND m.course_id = $2 AND m.exam_type = $3
         AND u.tenant_id = $1 AND u.dept_id = $4
         AND m.status = 'PENDING_COE'
       ORDER BY u.name, m.student_user_id`,
      [tenantId, snapshot.course_id, snapshot.exam_type, departmentId],
    );
    const latest = await this.db.query<Array<{ decision: string; input_hash: string }>>(
      `SELECT decision, input_hash FROM exam_result_hod_decisions
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY decided_at DESC, decision_id DESC LIMIT 1`,
      [tenantId, sessionId],
    );
    return {
      session_id: sessionId,
      course_code: snapshot.course_code,
      course_name: snapshot.course_name,
      exam_type: snapshot.exam_type,
      semester: snapshot.semester,
      max_marks: snapshot.max_marks,
      input_hash: snapshot.input_hash,
      decision: latest[0]?.input_hash === snapshot.input_hash ? latest[0].decision : null,
      marks,
    };
  }

  async decideHodEndTermSession(
    tenantId: string,
    sessionId: string,
    hodUserId: string,
    decision: 'APPROVED' | 'REJECTED',
    expectedHash: string,
    comment?: string,
  ) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new BadRequestException('A current review snapshot is required');
    if (decision === 'REJECTED' && !comment?.trim()) throw new BadRequestException('Give a reason for rejection');
    const outcome = await this.db.transaction(async (tx) => {
      const snapshot = await this.workflowSnapshot(tx, tenantId, sessionId, true);
      const departmentId = await this.assertHodOwnsSession(tx, tenantId, sessionId, hodUserId);
      const ambiguous = await tx.query<Array<{ session_id: string }>>(
        `SELECT session_id FROM exam_result_sessions WHERE tenant_id=$1 AND course_id=$2
         AND exam_type=$3 AND session_id<>$4 LIMIT 1`,
        [tenantId, snapshot.course_id, snapshot.exam_type, sessionId],
      );
      if (ambiguous[0]) throw new BadRequestException('Multiple sessions share these marks; Exam Cell must reconcile the course identity');
      this.assertUnpublished(snapshot);
      if (snapshot.input_hash !== expectedHash) throw new BadRequestException('Marks changed; refresh before deciding');
      const pending = snapshot.marks.filter((mark) => mark.status === 'PENDING_COE');
      if (!pending.length) throw new BadRequestException('No faculty-submitted marks to review');
      if (pending.some((mark) => Number(mark.max_marks) !== Number(snapshot.max_marks) ||
        !Number.isFinite(Number(mark.marks_obtained)) ||
        Number(mark.marks_obtained) < 0 || Number(mark.marks_obtained) > Number(snapshot.max_marks))) {
        throw new BadRequestException('Submitted marks do not match this session maximum');
      }
      const roster = await tx.query<Array<{ student_user_id: string }>>(
        `SELECT e.student_user_id FROM student_course_enrollments e
         JOIN users student ON student.user_id = e.student_user_id
         WHERE e.tenant_id = $1 AND e.course_id = $2 AND e.deleted_at IS NULL
           AND e.status IN ('ENROLLED','COMPLETED','FAILED')
           AND student.tenant_id = $1 AND student.dept_id = $3
         FOR UPDATE OF e`,
        [tenantId, snapshot.course_id, departmentId],
      );
      const rosterIds = new Set(roster.map((row) => row.student_user_id));
      const outsideDepartment = await tx.query<Array<{ student_user_id: string }>>(
        `SELECT e.student_user_id FROM student_course_enrollments e
         JOIN users student ON student.user_id = e.student_user_id
         WHERE e.tenant_id=$1 AND e.course_id=$2 AND e.deleted_at IS NULL
           AND e.status IN ('ENROLLED','COMPLETED','FAILED')
           AND (student.tenant_id IS DISTINCT FROM $1::uuid OR student.dept_id IS DISTINCT FROM $3)
         LIMIT 1`,
        [tenantId, snapshot.course_id, departmentId],
      );
      if (outsideDepartment[0]) {
        throw new BadRequestException('Cross-department or invalid-tenant course roster needs Exam Cell reconciliation before HOD approval');
      }
      if (!rosterIds.size || pending.length !== rosterIds.size ||
          pending.some((mark) => !rosterIds.has(mark.student_user_id))) {
        throw new BadRequestException('Every enrolled student must have one submitted end-semester mark before HOD review');
      }
      const ownMarks = await tx.query<Array<{ mark_id: string }>>(
        `SELECT mark_id FROM academic_marks WHERE tenant_id=$1 AND course_id=$2
         AND exam_type=$3 AND uploaded_by=$4 AND status='PENDING_COE' LIMIT 1`,
        [tenantId, snapshot.course_id, snapshot.exam_type, hodUserId],
      );
      if (ownMarks[0] && decision === 'APPROVED') {
        throw new ForbiddenException('A faculty member cannot approve their own end-semester marks');
      }
      const existing = await tx.query<Array<{ decision_id: string; decision: string }>>(
        `SELECT decision_id, decision FROM exam_result_hod_decisions
         WHERE tenant_id=$1 AND session_id=$2 AND input_hash=$3
         ORDER BY decided_at DESC, decision_id DESC LIMIT 1`,
        [tenantId, sessionId, snapshot.input_hash],
      );
      if (existing[0]?.decision === decision) return { ...existing[0], status: decision, input_hash: snapshot.input_hash, course_code: snapshot.course_code, idempotent: true };
      if (existing[0]) {
        throw new BadRequestException('This mark-sheet revision already has a HOD decision. Exam Cell must reopen and resubmit a changed revision.');
      }
      const rows = await tx.query<Array<{ decision_id: string }>>(
        `INSERT INTO exam_result_hod_decisions
           (tenant_id,session_id,department_id,input_hash,decision,decided_by,decision_comment)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING decision_id`,
        [tenantId, sessionId, departmentId, snapshot.input_hash, decision, hodUserId, comment?.trim() ?? null],
      );
      await this.audit.log(tenantId, hodUserId, {
        action: `RESULT_HOD_${decision}`,
        resource_type: 'exam_result_session', resource_id: sessionId,
        new_value: { department_id: departmentId, input_hash: snapshot.input_hash, comment: comment?.trim() ?? null },
      }, tx);
      return { decision_id: rows[0].decision_id, status: decision, input_hash: snapshot.input_hash, course_code: snapshot.course_code, idempotent: false };
    });
    if (!outcome.idempotent) {
      try {
        const officers = await this.db.query<Array<{ user_id: string }>>(
          `SELECT DISTINCT u.user_id FROM users u
           JOIN user_roles ur ON ur.user_id=u.user_id
           JOIN roles r ON r.role_id=ur.role_id
           WHERE u.tenant_id=$1 AND u.is_active=TRUE AND u.deleted_at IS NULL
             AND LOWER(r.role_name) IN ('examcell','examadmin','deputycoe')`,
          [tenantId],
        );
        for (const officer of officers) {
          this.notify.approvalRequired({
            tenantId,
            userId: officer.user_id,
            category: 'Results',
            requestType: 'End-semester mark sheet',
            requesterName: 'Department HOD',
            title: decision === 'APPROVED'
              ? `HOD approved ${outcome.course_code} marks for release`
              : `HOD rejected ${outcome.course_code} marks`,
            message: decision === 'APPROVED'
              ? 'Run the final audit and release the end-semester results.'
              : 'Reopen the entry window for faculty correction; the marks cannot be released.',
            actionLink: '/exam-cell/results',
          });
        }
      } catch {
        // The append-only decision remains available in the Exam Cell queue.
      }
    }
    return outcome;
  }

  async declareSession(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
    dto: DeclareResultSessionDto,
  ) {
    const notifications: Array<
      Parameters<NotificationEmitterService['examResultsPublished']>[0]
    > = [];
    let publication: {
      declared: number;
      course_name: string;
      exam_type: string;
      session_id: string;
    };
    try {
      publication = await this.db.transaction(async (manager) => {
      // Serialize declarations and roll back every student if a result/report
      // write fails, so students cannot see partially published marks.
      const snapshot = await this.workflowSnapshot(
        manager,
        tenantId,
        sessionId,
        true,
      );
      const session = snapshot;
      const courseName = session.course_name ?? 'Course';
      if (isEndSemesterExamType(snapshot.exam_type)) {
        const ambiguous = await manager.query<Array<{ session_id: string }>>(
          `SELECT session_id FROM exam_result_sessions WHERE tenant_id=$1 AND course_id=$2
           AND exam_type=$3 AND session_id<>$4 LIMIT 1`,
          [tenantId, snapshot.course_id, snapshot.exam_type, sessionId],
        );
        if (ambiguous[0]) throw new BadRequestException('Multiple sessions share these marks; reconcile the course identity before release');
      }
      this.assertUnpublished(snapshot);
      this.assertLocked(snapshot);
      await this.assertCurrentCoeAudit(
        manager,
        tenantId,
        sessionId,
        snapshot.input_hash,
      );
      const approvals = await manager.query<
        Array<{
          status: string;
          request_summary: {
            input_hash?: string;
            invalidated_at?: string;
          } | null;
        }>
      >(
        `SELECT status,request_summary FROM exam_result_dean_approval_requests WHERE tenant_id=$1 AND session_id=$2 ORDER BY requested_at DESC,created_at DESC,request_id DESC LIMIT 1 FOR UPDATE`,
        [tenantId, sessionId],
      );
      const approved = approvals[0];
      if (isEndSemesterExamType(snapshot.exam_type)) {
        const hod = await manager.query<Array<{ decision: string; input_hash: string; department_id: number }>>(
          `SELECT decision,input_hash,department_id FROM exam_result_hod_decisions
           WHERE tenant_id=$1 AND session_id=$2
           ORDER BY decided_at DESC,decision_id DESC LIMIT 1 FOR UPDATE`,
          [tenantId, sessionId],
        );
        if (!snapshot.owner_department_id || hod[0]?.department_id !== snapshot.owner_department_id ||
            hod[0]?.decision !== 'APPROVED' || hod[0]?.input_hash !== snapshot.input_hash) {
          throw new BadRequestException('Current concerned-department HOD approval is required for these exact end-semester marks before Exam Cell release');
        }
      } else if (
        approved?.status !== 'APPROVED' ||
        approved.request_summary?.invalidated_at ||
        approved.request_summary?.input_hash !== snapshot.input_hash
      ) {
        throw new BadRequestException(
          'Current Dean approval is required for these exact marks and grading rules before publishing results',
        );
      }
      const bands = parseGradeBands(snapshot.grading_rules);
      const passMarks =
        snapshot.pass_marks != null ? Number(snapshot.pass_marks) : null;
      const marks = snapshot.marks.filter((m) => m.status === 'PENDING_COE');
      if (!marks.length)
        throw new BadRequestException('No PENDING_COE marks to declare');

      for (const row of marks) {
        const obtained = Number(row.marks_obtained);
        const max = Number(row.max_marks ?? session.max_marks);
        const percent =
          max > 0 ? Number(((obtained / max) * 100).toFixed(2)) : 0;
        const { grade, gradePoints } = computeGradeFromPercent(percent, bands);
        const resultStatus = computePassFail(obtained, max, passMarks);
        const summary = `${courseName} ${session.exam_type}: ${obtained}/${max} (${percent}%) — Grade ${grade}`;

        await manager.query(
          `UPDATE academic_marks SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE mark_id = $1`,
          [row.mark_id],
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
          gradePoints,
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

        await invalidateOfficialTranscripts(manager, {
          tenantId,
          studentUserId: row.student_user_id,
          semester: session.semester as number,
          actor: { userId: actorUserId },
          reason: `Results published for session ${sessionId}`,
        });
        if (
          session.exam_type === 'END_TERM' ||
          session.exam_type === 'INTERNAL'
        ) {
          await manager.query(
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

        notifications.push({
          tenantId,
          userId: row.student_user_id,
          courseName,
          examType: session.exam_type,
          actionLink: `/student/marks?report=${sessionId}`,
          message: summary,
        });
      }

      const declaredSession = await manager.query<Array<{ session_id: string }>>(
        `UPDATE exam_result_sessions
       SET declared_at = NOW(), declared_by = $2, declaration_note = $3,
           entry_status = 'LOCKED', marks_locked = TRUE, updated_at = NOW()
       WHERE session_id = $1 AND tenant_id = $4 AND declared_at IS NULL
       RETURNING session_id`,
        [
          sessionId,
          actorUserId,
          dto.declaration_note?.trim() ?? null,
          tenantId,
        ],
      );
      if (!declaredSession.length) {
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
            declared: marks.length,
            input_hash: snapshot.input_hash,
            outcome: 'SUCCESS',
          },
        },
        manager,
      );
      return {
        declared: marks.length,
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
        // Preserve the original publication error if failure auditing is unavailable.
      }
      throw error;
    }

    // Emit only after the database commit, so failures never send premature
    // publication alerts to students.
    for (const notification of notifications) {
      this.notify.examResultsPublished(notification);
      await this.db.query(
        `UPDATE student_exam_reports SET notified_at = NOW()
         WHERE session_id = $1 AND student_user_id = $2 AND tenant_id = $3`,
        [sessionId, notification.userId, tenantId],
      );
    }

    return publication;
  }

  /** Keep legacy student results and Result Control reports in the same commit. */
  private async upsertExamResult(
    manager: EntityManager,
    tenantId: string,
    studentUserId: string,
    courseId: string,
    examType: string,
    marksObtained: number,
    maxMarks: number,
    grade: string,
    gradePoints: number,
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`published-result:${tenantId}:${studentUserId}:${courseId}:${examType}`],
    );
    const existing = await manager.query<Array<{ result_id: string }>>(
      `SELECT result_id FROM academic_exam_results
       WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND exam_type=$4 FOR UPDATE`,
      [tenantId, studentUserId, courseId, examType],
    );
    if (existing.length > 1)
      throw new BadRequestException(
        'Duplicate published result identities require reconciliation before declaration',
      );
    if (existing[0]) {
      await manager.query(
        `UPDATE academic_exam_results SET marks_obtained=$3, max_marks=$4, grade=$5,
         grade_points=$6, status='PUBLISHED', updated_at=NOW() WHERE tenant_id=$1 AND result_id=$2`,
        [
          tenantId,
          existing[0].result_id,
          marksObtained,
          maxMarks,
          grade,
          gradePoints,
        ],
      );
      return;
    }
    await manager.query(
      `INSERT INTO academic_exam_results (
           tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, grade, grade_points, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PUBLISHED')`,
      [
        tenantId,
        studentUserId,
        courseId,
        examType,
        marksObtained,
        maxMarks,
        grade,
        gradePoints,
      ],
    );
  }

  async getSessionForCourse(
    tenantId: string,
    courseId: string,
    examType: string,
    semester?: number,
  ) {
    const rows = await this.db.query(
      `SELECT * FROM exam_result_sessions
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
         AND ($4::integer IS NULL OR semester = $4)
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, courseId, examType, semester ?? null],
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

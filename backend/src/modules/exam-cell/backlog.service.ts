import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import {
  computeGradeFromPercent,
  computePassFail,
  parseGradeBands,
} from './grading-engine';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';
import { invalidateOfficialTranscripts } from './official-transcript-revisions';
import type {
  ApplyBacklogDto,
  ConfigureBacklogOfferingDto,
  ReviewBacklogDto,
} from './dto/backlog.dto';

type Query = Pick<EntityManager, 'query'>;
type Row = {
  [key: string]: unknown;
  tenant_id: string;
  offering_id: string;
  attempt_id: string;
  application_id: string;
  student_user_id: string;
  course_id: string;
  course_code: string;
  faculty_user_id: string;
  exam_session_id: string;
  exam_schedule_id: string;
  source_exam_type: string;
  source_result_id: string;
  report_id: string;
  session_id: string;
  subject_id: number;
  semester: number;
  attempt_limit: number;
  attempt_number: number;
  attempts: number;
  academic_year: string;
  opens_at: string;
  closes_at: string;
  payment_due_date: string;
  fee_mode: string;
  fee_amount: number | string;
  finance_demand_id: string | null;
  demand_status: string | null;
  fee_status: string;
  status: string;
  marks_status: string;
  max_marks: number | string;
  pass_marks: number | string;
  marks_obtained: number | null;
  grade: string;
  grade_points: number | string;
  result_status: string;
  selected_attempt_id: string | null;
  rules: Record<string, unknown>;
  grading_rules: Record<string, unknown>;
  dept_id: number | null;
};

/** Retakes have their own immutable identities and never overwrite source marks. */
@Injectable()
export class BacklogService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly finance: FinanceService,
    private readonly audit: ExamCellAuditService,
  ) {}

  listOfferings(tenant: string, student = false) {
    return this.db.query<Row[]>(
      `SELECT o.*, c.course_code, c.course_name, u.name AS faculty_name,
      s.session_name, es.exam_date::text AS exam_date
      FROM exam_backlog_offerings o
      JOIN academic_courses c ON c.course_id=o.course_id AND c.tenant_id=o.tenant_id
      JOIN users u ON u.user_id=o.faculty_user_id AND u.tenant_id=o.tenant_id
      JOIN exam_sessions s ON s.session_id=o.exam_session_id AND s.tenant_id=o.tenant_id
      JOIN exam_schedules es ON es.exam_schedule_id=o.exam_schedule_id AND es.tenant_id=o.tenant_id
      WHERE o.tenant_id=$1 ${student ? "AND o.status='OPEN' AND NOW() BETWEEN o.opens_at AND o.closes_at" : ''}
      ORDER BY o.created_at DESC`,
      [tenant],
    );
  }

  async configure(
    tenant: string,
    actor: string,
    dto: ConfigureBacklogOfferingDto,
  ) {
    if (
      !['END_TERM', 'INTERNAL'].includes(dto.source_exam_type) ||
      !dto.academic_year?.trim() ||
      !Number.isInteger(dto.semester) ||
      dto.semester < 1 ||
      dto.semester > 2147483647 ||
      !Number.isInteger(dto.grading_policy_id) ||
      dto.grading_policy_id < 1 ||
      dto.grading_policy_id > 2147483647 ||
      !(new Date(dto.closes_at) > new Date(dto.opens_at)) ||
      !Number.isFinite(dto.max_marks) ||
      dto.max_marks <= 0 ||
      dto.max_marks > 9999.99 ||
      !Number.isFinite(dto.pass_marks) ||
      dto.pass_marks < 0 ||
      dto.pass_marks > dto.max_marks ||
      !Number.isInteger(dto.attempt_limit) ||
      dto.attempt_limit < 1 ||
      dto.attempt_limit > 2147483647 ||
      !['LATEST_ATTEMPT', 'BEST_ATTEMPT'].includes(dto.selection_policy) ||
      !['REQUIRED', 'NO_FEE'].includes(dto.fee_mode) ||
      !Number.isFinite(dto.fee_amount) ||
      dto.fee_amount > 9999999999.99 ||
      (dto.fee_mode === 'NO_FEE' ? dto.fee_amount !== 0 : dto.fee_amount < 1)
    ) {
      throw new BadRequestException(
        'Complete explicit registration, fee, attempt, grading and selection rules are required',
      );
    }
    return this.db.transaction(async (tx) => {
      const [course] = await tx.query<Row[]>(
        'SELECT course_id, course_code FROM academic_courses WHERE tenant_id=$1 AND course_id=$2 FOR KEY SHARE',
        [tenant, dto.course_id],
      );
      if (!course) throw new NotFoundException('Course not found');
      const [session] = await tx.query<Row[]>(
        `SELECT session_id,start_date::text AS start_date,end_date::text AS end_date FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2
        AND cycle_type IN ('SUPPLEMENTARY','BACK_PAPER') AND (semester IS NULL OR semester=$3) FOR KEY SHARE`,
        [tenant, dto.exam_session_id, dto.semester],
      );
      if (!session)
        throw new BadRequestException(
          'Select a matching supplementary or back-paper session',
        );
      const [schedule] = await tx.query<Row[]>(
        `SELECT es.exam_schedule_id FROM exam_schedules es JOIN academic_subjects sub ON sub.subject_id=es.subject_id
        WHERE es.tenant_id=$1 AND es.exam_schedule_id=$2 AND sub.subject_code=$3 AND sub.semester=$4
          AND ($5::date IS NULL OR es.exam_date >= $5::date) AND ($6::date IS NULL OR es.exam_date <= $6::date) FOR KEY SHARE OF es`,
        [
          tenant,
          dto.exam_schedule_id,
          course.course_code,
          dto.semester,
          session.start_date ?? null,
          session.end_date ?? null,
        ],
      );
      if (!schedule)
        throw new BadRequestException(
          'Retake schedule must match the tenant course, semester and configured session date range',
        );
      await this.assertFaculty(tx, tenant, dto.faculty_user_id, dto.course_id);
      const [policy] = await tx.query<Row[]>(
        'SELECT rules FROM academic_grading_policies WHERE policy_id=$1',
        [dto.grading_policy_id],
      );
      this.requireGradeRules(policy?.rules);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `backlog-policy:${tenant}:${dto.course_id}:${dto.semester}:${dto.source_exam_type}`,
      ]);
      const inconsistent = await tx.query<Row[]>(
        `SELECT offering_id FROM exam_backlog_offerings
        WHERE tenant_id=$1 AND course_id=$2 AND semester=$3 AND source_exam_type=$4 AND selection_policy<>$5 LIMIT 1`,
        [
          tenant,
          dto.course_id,
          dto.semester,
          dto.source_exam_type,
          dto.selection_policy,
        ],
      );
      if (inconsistent[0])
        throw new ConflictException(
          'Existing retakes use a different selection policy; an academic policy migration is required',
        );
      const [offering] = await tx.query<Row[]>(
        `INSERT INTO exam_backlog_offerings
        (tenant_id,course_id,semester,source_exam_type,exam_session_id,exam_schedule_id,faculty_user_id,academic_year,
         opens_at,closes_at,payment_due_date,fee_mode,fee_amount,attempt_limit,selection_policy,grading_policy_id,grading_rules,max_marks,pass_marks,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,'DRAFT',$20) RETURNING *`,
        [
          tenant,
          dto.course_id,
          dto.semester,
          dto.source_exam_type,
          dto.exam_session_id,
          dto.exam_schedule_id,
          dto.faculty_user_id,
          dto.academic_year,
          dto.opens_at,
          dto.closes_at,
          dto.payment_due_date,
          dto.fee_mode,
          dto.fee_amount,
          dto.attempt_limit,
          dto.selection_policy,
          dto.grading_policy_id,
          JSON.stringify(policy.rules),
          dto.max_marks,
          dto.pass_marks,
          actor,
        ],
      );
      await this.log(
        tx,
        tenant,
        actor,
        'BACKLOG_OFFERING_CONFIGURED',
        offering.offering_id,
        {
          selection_policy: dto.selection_policy,
          fee_mode: dto.fee_mode,
          fee_amount: dto.fee_amount,
          attempt_limit: dto.attempt_limit,
        },
      );
      return offering;
    });
  }

  async setOfferingStatus(
    tenant: string,
    actor: string,
    id: string,
    status: 'OPEN' | 'CLOSED',
  ) {
    return this.db.transaction(async (tx) => {
      const offering = await this.offering(tx, tenant, id, true);
      this.requireGradeRules(offering.grading_rules);
      const [row] = await tx.query<Row[]>(
        `WITH changed AS (UPDATE exam_backlog_offerings SET status=$3
        WHERE tenant_id=$1 AND offering_id=$2 RETURNING *) SELECT * FROM changed`,
        [tenant, id, status],
      );
      await this.log(tx, tenant, actor, 'BACKLOG_OFFERING_' + status, id, {
        status,
      });
      return row;
    });
  }

  listSources(tenant: string, student: string) {
    return this.db.query<Row[]>(
      `SELECT r.report_id AS source_report_id, r.session_id AS source_session_id,
      r.course_id, r.exam_type AS source_exam_type, r.marks_obtained,r.max_marks,r.percent,r.grade,r.grade_points,r.result_status,
      s.semester,c.course_code,c.course_name,r.declared_at
      FROM student_exam_reports r JOIN exam_result_sessions s ON s.session_id=r.session_id AND s.tenant_id=r.tenant_id
      JOIN academic_courses c ON c.course_id=r.course_id AND c.tenant_id=r.tenant_id
      JOIN student_course_enrollments e ON e.tenant_id=r.tenant_id AND e.student_user_id=r.student_user_id AND e.course_id=r.course_id AND e.semester=s.semester
      JOIN users u ON u.user_id=r.student_user_id AND u.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.student_user_id=$2 AND r.result_status='FAIL' AND s.declared_at IS NOT NULL AND e.status='FAILED'
      ORDER BY r.declared_at DESC`,
      [tenant, student],
    );
  }

  listAttempts(
    tenant: string,
    filter: { student?: string; faculty?: string } = {},
  ) {
    const params: string[] = [tenant];
    let scope = '';
    if (filter.student) {
      params.push(filter.student);
      scope += ' AND a.student_user_id=$' + params.length;
    }
    if (filter.faculty) {
      params.push(filter.faculty);
      scope += ' AND o.faculty_user_id=$' + params.length;
    }
    return this.db
      .query<Row[]>(
        `SELECT a.*, o.max_marks,o.pass_marks,o.fee_mode,o.fee_amount,o.attempt_limit,o.selection_policy,
      o.faculty_user_id,o.exam_schedule_id,o.offering_id AS retake_session_id,c.course_code,c.course_name,u.name AS student_name,
      app.fee_status,app.finance_demand_id,d.status AS demand_status,d.paid_amount,
      CASE WHEN a.status='PUBLISHED' THEN a.marks_obtained ELSE NULL END AS published_marks
      FROM exam_backlog_attempts a JOIN exam_backlog_offerings o ON o.offering_id=a.offering_id AND o.tenant_id=a.tenant_id
      JOIN exam_applications app ON app.exam_application_id=a.application_id AND app.tenant_id=a.tenant_id
      JOIN academic_courses c ON c.course_id=a.course_id AND c.tenant_id=a.tenant_id
      JOIN users u ON u.user_id=a.student_user_id AND u.tenant_id=a.tenant_id
      LEFT JOIN finance_fee_demands d ON d.demand_id=app.finance_demand_id AND d.tenant_id=a.tenant_id AND d.student_user_id=a.student_user_id
      WHERE a.tenant_id=$1 ${scope} ORDER BY a.created_at DESC`,
        params,
      )
      .then((rows) =>
        filter.student
          ? rows.map((row) => ({
              ...row,
              marks_obtained:
                row.status === 'PUBLISHED' ? row.marks_obtained : null,
              grade: row.status === 'PUBLISHED' ? row.grade : null,
              grade_points:
                row.status === 'PUBLISHED' ? row.grade_points : null,
              percent: row.status === 'PUBLISHED' ? row.percent : null,
              result_status:
                row.status === 'PUBLISHED' ? row.result_status : null,
            }))
          : rows,
      );
  }

  async listDeanAttempts(tenant: string, actor: string, roles: string[]) {
    const rows = await this.listAttempts(tenant);
    if (roles.some((role) => role.toLowerCase() === 'superadmin'))
      return rows.filter((row) => row.marks_status === 'COE_APPROVED');
    const scope = await resolveDeanDepartmentIds(this.db, actor);
    if (!scope.length) return [];
    const students = await this.db.query<{ user_id: string }[]>(
      'SELECT user_id FROM users WHERE tenant_id=$1 AND dept_id=ANY($2::int[])',
      [tenant, scope],
    );
    const allowed = new Set(students.map((row) => row.user_id));
    return rows.filter(
      (row) =>
        row.marks_status === 'COE_APPROVED' && allowed.has(row.student_user_id),
    );
  }

  async apply(tenant: string, student: string, dto: ApplyBacklogDto) {
    let demand: Awaited<ReturnType<FinanceService['createDemand']>> | undefined;
    const attempt = await this.db.transaction(async (tx) => {
      await tx.query(
        'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',
        [tenant, student],
      );
      const offering = await this.offering(tx, tenant, dto.offering_id, true);
      this.requireGradeRules(offering.grading_rules);
      if (
        offering.status !== 'OPEN' ||
        new Date(offering.opens_at) > new Date() ||
        new Date(offering.closes_at) < new Date()
      )
        throw new BadRequestException('Backlog registration is not open');
      await this.assertNoUfm(tx, tenant, student);
      const sourceRows = await tx.query<Row[]>(
        `SELECT r.*,s.semester,ar.result_id AS source_result_id,sub.subject_id
        FROM student_exam_reports r JOIN exam_result_sessions s ON s.session_id=r.session_id AND s.tenant_id=r.tenant_id
        JOIN academic_courses c ON c.course_id=r.course_id AND c.tenant_id=r.tenant_id
        JOIN academic_subjects sub ON sub.subject_code=c.course_code AND sub.semester=s.semester
        JOIN student_course_enrollments e ON e.tenant_id=r.tenant_id AND e.student_user_id=r.student_user_id AND e.course_id=r.course_id AND e.semester=s.semester
        JOIN academic_exam_results ar ON ar.tenant_id=r.tenant_id AND ar.student_user_id=r.student_user_id AND ar.course_id=r.course_id AND ar.exam_type=r.exam_type AND ar.status='PUBLISHED'
        WHERE r.tenant_id=$1 AND r.student_user_id=$2 AND r.report_id=$3 AND r.result_status='FAIL'
          AND s.declared_at IS NOT NULL AND e.status='FAILED' AND r.course_id=$4 AND s.semester=$5 AND r.exam_type=$6
        FOR UPDATE OF r,e,ar`,
        [
          tenant,
          student,
          dto.source_report_id,
          offering.course_id,
          offering.semester,
          offering.source_exam_type,
        ],
      );
      if (sourceRows.length !== 1)
        throw new BadRequestException(
          'A single matching declared failed course and published result is required',
        );
      const source = sourceRows[0];
      const competing = await tx.query<Row[]>(
        `SELECT exam_application_id FROM exam_applications WHERE tenant_id=$1 AND student_user_id=$2
        AND (source_result_id=$3 OR (source_result_id IS NULL AND subject_id=$4))
        AND application_type='RE_EVALUATION' AND status NOT IN ('REJECTED','COMPLETED') LIMIT 1`,
        [tenant, student, source.source_result_id, source.subject_id],
      );
      if (competing[0])
        throw new ConflictException(
          'An active revaluation for this source result must be resolved before applying for a retake',
        );
      const existing = await tx.query<Row[]>(
        `SELECT attempt_id FROM exam_backlog_attempts WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3
        AND semester=$4 AND source_exam_type=$5 AND (status NOT IN ('REJECTED','PUBLISHED') OR (offering_id=$6 AND status<>'REJECTED')) LIMIT 1`,
        [
          tenant,
          student,
          offering.course_id,
          offering.semester,
          offering.source_exam_type,
          offering.offering_id,
        ],
      );
      if (existing[0])
        throw new ConflictException(
          'An active retake application or a completed attempt for this offering already exists',
        );
      const [count] = await tx.query<Row[]>(
        `SELECT COUNT(*)::int AS attempts FROM exam_backlog_attempts WHERE tenant_id=$1 AND student_user_id=$2
        AND course_id=$3 AND semester=$4 AND source_exam_type=$5 AND status='PUBLISHED'`,
        [
          tenant,
          student,
          offering.course_id,
          offering.semester,
          offering.source_exam_type,
        ],
      );
      if (Number(count.attempts) >= Number(offering.attempt_limit))
        throw new BadRequestException(
          'Configured retake attempt limit reached',
        );
      const [application] = await tx.query<Row[]>(
        `INSERT INTO exam_applications(tenant_id,student_user_id,subject_id,application_type,fee_status,status)
        VALUES($1,$2,$3,'BACKLOG',$4,$5) RETURNING exam_application_id`,
        [
          tenant,
          student,
          source.subject_id,
          offering.fee_mode === 'NO_FEE' ? 'WAIVED' : 'PENDING',
          offering.fee_mode === 'NO_FEE' ? 'PENDING' : 'DRAFT',
        ],
      );
      if (offering.fee_mode === 'REQUIRED') {
        demand = await this.finance.createDemand(
          {
            student_user_id: student,
            fee_head: 'BACKLOG',
            academic_year: offering.academic_year,
            semester: Number(offering.semester),
            total_amount: Number(offering.fee_amount),
            due_date: String(offering.payment_due_date).slice(0, 10),
            fee_breakup: {
              backlog_offering_id: offering.offering_id,
              exam_application_id: application.exam_application_id,
            },
          },
          tenant,
          { manager: tx, notify: false },
        );
        await tx.query(
          'UPDATE exam_applications SET finance_demand_id=$3 WHERE tenant_id=$1 AND exam_application_id=$2',
          [tenant, application.exam_application_id, demand.demand_id],
        );
      }
      const [row] = await tx.query<Row[]>(
        `INSERT INTO exam_backlog_attempts(tenant_id,offering_id,application_id,student_user_id,course_id,semester,source_exam_type,
        source_result_id,source_report_id,source_session_id,original_snapshot,attempt_number,status,marks_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'DRAFT') RETURNING *`,
        [
          tenant,
          offering.offering_id,
          application.exam_application_id,
          student,
          offering.course_id,
          offering.semester,
          offering.source_exam_type,
          source.source_result_id,
          source.report_id,
          source.session_id,
          JSON.stringify(source),
          Number(count.attempts) + 1,
          offering.fee_mode === 'NO_FEE' ? 'PENDING_REVIEW' : 'PAYMENT_PENDING',
        ],
      );
      await this.log(
        tx,
        tenant,
        student,
        'BACKLOG_APPLICATION_CREATED',
        row.attempt_id,
        {
          offering_id: offering.offering_id,
          source_report_id: source.report_id,
          fee_amount: offering.fee_amount,
        },
      );
      return { ...row, finance_demand_id: demand?.demand_id ?? null };
    });
    if (demand) this.finance.notifyDemandGenerated(demand, tenant);
    return attempt;
  }

  async synchronizePayment(tenant: string, student: string, id: string) {
    return this.db.transaction(async (tx) => {
      const attempt = await this.attempt(tx, tenant, id);
      if (attempt.student_user_id !== student)
        throw new NotFoundException('Backlog attempt not found');
      await this.requirePayment(tx, attempt);
      if (attempt.status === 'PAYMENT_PENDING') {
        await tx.query(
          "UPDATE exam_backlog_attempts SET status='PENDING_REVIEW' WHERE tenant_id=$1 AND attempt_id=$2",
          [tenant, id],
        );
        await tx.query(
          "UPDATE exam_applications SET fee_status='PAID',status='PENDING' WHERE tenant_id=$1 AND exam_application_id=$2",
          [tenant, attempt.application_id],
        );
        await this.log(tx, tenant, student, 'BACKLOG_PAYMENT_VERIFIED', id, {});
      }
      return { verified: true, attempt_id: id };
    });
  }

  async review(
    tenant: string,
    actor: string,
    id: string,
    dto: ReviewBacklogDto,
  ) {
    if (!dto.reason?.trim())
      throw new BadRequestException('Review reason is required');
    return this.db.transaction(async (tx) => {
      const a = await this.attempt(tx, tenant, id);
      if (!['PAYMENT_PENDING', 'PENDING_REVIEW'].includes(a.status))
        throw new BadRequestException('Application is not pending review');
      if (dto.decision === 'APPROVED') {
        await this.requirePayment(tx, a);
        await this.assertNoUfm(tx, tenant, a.student_user_id);
        await this.assertFailedEnrollment(tx, tenant, a);
      }
      const status = dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      await tx.query(
        'UPDATE exam_backlog_attempts SET status=$3,reviewed_by=$4,reviewed_at=NOW(),review_reason=$5 WHERE tenant_id=$1 AND attempt_id=$2',
        [tenant, id, status, actor, dto.reason.trim()],
      );
      await tx.query(
        'UPDATE exam_applications SET status=$3,fee_status=$4 WHERE tenant_id=$1 AND exam_application_id=$2',
        [
          tenant,
          a.application_id,
          status,
          a.fee_mode === 'NO_FEE'
            ? 'WAIVED'
            : a.demand_status === 'PAID'
              ? 'PAID'
              : a.fee_status,
        ],
      );
      await this.log(tx, tenant, actor, 'BACKLOG_' + status, id, {
        reason: dto.reason.trim(),
      });
      return { attempt_id: id, status };
    });
  }

  async saveMarks(tenant: string, faculty: string, id: string, marks: number) {
    return this.db.transaction(async (tx) => {
      const a = await this.attempt(tx, tenant, id);
      if (a.faculty_user_id !== faculty)
        throw new ForbiddenException(
          'Only the assigned faculty may enter retake marks',
        );
      await this.assertFaculty(tx, tenant, faculty, a.course_id);
      if (a.status !== 'APPROVED' || a.marks_status !== 'DRAFT')
        throw new BadRequestException('Retake marks are not open for entry');
      if (!Number.isFinite(marks) || marks < 0 || marks > Number(a.max_marks))
        throw new BadRequestException(
          'Marks must be within the configured maximum',
        );
      await tx.query(
        'UPDATE exam_backlog_attempts SET marks_obtained=$3,marks_entered_by=$4 WHERE tenant_id=$1 AND attempt_id=$2',
        [tenant, id, marks, faculty],
      );
      await this.log(tx, tenant, faculty, 'BACKLOG_MARKS_SAVED', id, {
        marks_obtained: marks,
      });
      return { attempt_id: id, saved: true };
    });
  }

  async advanceMarks(
    tenant: string,
    actor: string,
    id: string,
    step: 'SUBMITTED' | 'COE_APPROVED' | 'DEAN_APPROVED',
    roles: string[] = [],
  ) {
    return this.db.transaction(async (tx) => {
      const a = await this.attempt(tx, tenant, id);
      if (a.status !== 'APPROVED' || a.marks_obtained == null)
        throw new BadRequestException(
          'Approved registration and saved marks are required',
        );
      const required = {
        SUBMITTED: 'DRAFT',
        COE_APPROVED: 'SUBMITTED',
        DEAN_APPROVED: 'COE_APPROVED',
      }[step];
      if (a.marks_status !== required)
        throw new BadRequestException(
          'Retake marks are not at the required workflow stage',
        );
      if (step === 'SUBMITTED') {
        if (a.faculty_user_id !== actor)
          throw new ForbiddenException(
            'Only assigned faculty may submit marks',
          );
        await this.assertFaculty(tx, tenant, actor, a.course_id);
      }
      if (
        step === 'DEAN_APPROVED' &&
        !roles.some((role) => role.toLowerCase() === 'superadmin')
      ) {
        const scope = await resolveDeanDepartmentIds(tx, actor);
        const [student] = await tx.query<Row[]>(
          'SELECT dept_id FROM users WHERE tenant_id=$1 AND user_id=$2',
          [tenant, a.student_user_id],
        );
        if (!student?.dept_id || !scope.includes(Number(student.dept_id)))
          throw new ForbiddenException(
            'This retake is outside your academic approval scope',
          );
      }
      await tx.query(
        `UPDATE exam_backlog_attempts SET marks_status=$3::varchar,
        coe_approved_by=CASE WHEN $3::varchar='COE_APPROVED' THEN $4::uuid ELSE coe_approved_by END,
        dean_approved_by=CASE WHEN $3::varchar='DEAN_APPROVED' THEN $4::uuid ELSE dean_approved_by END
        WHERE tenant_id=$1 AND attempt_id=$2`,
        [tenant, id, step, actor],
      );
      await this.log(tx, tenant, actor, 'BACKLOG_MARKS_' + step, id, {});
      return { attempt_id: id, marks_status: step };
    });
  }

  async publish(tenant: string, actor: string, id: string) {
    return this.db.transaction(async (tx) => {
      const a = await this.attempt(tx, tenant, id);
      if (a.status !== 'APPROVED' || a.marks_status !== 'DEAN_APPROVED')
        throw new BadRequestException(
          'Faculty submission, COE audit and Dean approval are required',
        );
      await this.requirePayment(tx, a);
      await this.assertNoUfm(tx, tenant, a.student_user_id);
      await this.assertFailedEnrollment(tx, tenant, a);
      const bands = this.requireGradeRules(a.grading_rules);
      const percent = Number(
        ((Number(a.marks_obtained) / Number(a.max_marks)) * 100).toFixed(2),
      );
      const { grade, gradePoints } = computeGradeFromPercent(percent, bands);
      const resultStatus = computePassFail(
        Number(a.marks_obtained),
        Number(a.max_marks),
        Number(a.pass_marks),
      );
      await tx.query(
        `UPDATE exam_backlog_attempts SET status='PUBLISHED',marks_status='PUBLISHED',percent=$3,grade=$4,grade_points=$5,
        result_status=$6,published_by=$7,published_at=NOW() WHERE tenant_id=$1 AND attempt_id=$2`,
        [tenant, id, percent, grade, gradePoints, resultStatus, actor],
      );
      const [current] = await tx.query<Row[]>(
        `SELECT * FROM exam_backlog_current_results WHERE tenant_id=$1 AND student_user_id=$2
        AND course_id=$3 AND semester=$4 AND source_exam_type=$5`,
        [
          tenant,
          a.student_user_id,
          a.course_id,
          a.semester,
          a.source_exam_type,
        ],
      );
      if (!current)
        throw new BadRequestException(
          'Selected retake result could not be resolved',
        );
      await tx.query(
        `UPDATE student_course_enrollments SET grade=$4,grade_points=$5,status=CASE WHEN $6='PASS' THEN 'COMPLETED' ELSE 'FAILED' END
        WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND semester=$7`,
        [
          tenant,
          a.student_user_id,
          a.course_id,
          current.grade,
          current.grade_points,
          current.result_status,
          a.semester,
        ],
      );
      await invalidateOfficialTranscripts(tx, {
        tenantId: tenant,
        studentUserId: a.student_user_id,
        semester: a.semester,
        actor: { userId: actor },
        reason:
          'Published backlog/supplementary result changed transcript source',
      });
      await tx.query(
        `SELECT grade_card_id FROM grade_cards WHERE tenant_id=$1 AND (student_user_id=$2 OR semester=$3
         OR semester IN(SELECT semester FROM grade_cards WHERE tenant_id=$1 AND student_user_id=$2))
         ORDER BY grade_card_id FOR UPDATE`,
        [tenant, a.student_user_id, a.semester],
      );
      await tx.query(
        `UPDATE grade_cards SET status=CASE WHEN status='WITHHELD' THEN 'WITHHELD' ELSE 'DRAFT' END,published_at=NULL,
        payload=jsonb_set(jsonb_set(COALESCE(payload,'{}'::jsonb),'{result_stage}','"DRAFT"'::jsonb),'{requires_regeneration}','true'::jsonb)
        WHERE tenant_id=$1 AND (student_user_id=$2 OR semester=$3 OR semester IN(SELECT semester FROM grade_cards WHERE tenant_id=$1 AND student_user_id=$2))`,
        [tenant, a.student_user_id, a.semester],
      );
      await tx.query(
        "UPDATE exam_applications SET status='COMPLETED',published_at=NOW(),published_by=$3 WHERE tenant_id=$1 AND exam_application_id=$2",
        [tenant, a.application_id, actor],
      );
      await this.log(tx, tenant, actor, 'BACKLOG_RESULT_PUBLISHED', id, {
        marks_obtained: a.marks_obtained,
        result_status: resultStatus,
        selected_attempt_id: current.selected_attempt_id,
        selection_policy: a.selection_policy,
      });
      return {
        attempt_id: id,
        status: 'PUBLISHED',
        marks_obtained: a.marks_obtained,
        max_marks: a.max_marks,
        grade,
        grade_points: gradePoints,
        result_status: resultStatus,
        selected_attempt_id: current.selected_attempt_id,
      };
    });
  }

  private async offering(tx: Query, tenant: string, id: string, lock = false) {
    const [row] = await tx.query<Row[]>(
      `SELECT *,payment_due_date::text AS payment_due_date FROM exam_backlog_offerings WHERE tenant_id=$1 AND offering_id=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenant, id],
    );
    if (!row)
      throw new NotFoundException('Configured backlog offering not found');
    return row;
  }
  private async attempt(tx: Query, tenant: string, id: string) {
    const [row] = await tx.query<Row[]>(
      `SELECT a.*,o.fee_mode,o.fee_amount,o.max_marks,o.pass_marks,o.grading_rules,o.selection_policy,o.faculty_user_id,
      app.finance_demand_id,app.fee_status,d.status AS demand_status
      FROM exam_backlog_attempts a JOIN exam_backlog_offerings o ON o.offering_id=a.offering_id AND o.tenant_id=a.tenant_id
      JOIN exam_applications app ON app.exam_application_id=a.application_id AND app.tenant_id=a.tenant_id
      LEFT JOIN finance_fee_demands d ON d.demand_id=app.finance_demand_id AND d.tenant_id=a.tenant_id AND d.student_user_id=a.student_user_id
      WHERE a.tenant_id=$1 AND a.attempt_id=$2 FOR UPDATE OF a`,
      [tenant, id],
    );
    if (!row) throw new NotFoundException('Backlog attempt not found');
    return row;
  }
  private async assertFaculty(
    tx: Query,
    tenant: string,
    faculty: string,
    course: string,
  ) {
    const [row] = await tx.query<Row[]>(
      `SELECT u.user_id FROM users u WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true
      AND (EXISTS(SELECT 1 FROM academic_course_allocations al WHERE al.tenant_id=$1 AND al.faculty_user_id=u.user_id AND al.course_id=$3 AND al.status='ACTIVE')
        OR EXISTS(SELECT 1 FROM academic_timetables t WHERE t.tenant_id=$1 AND t.faculty_user_id=u.user_id AND t.course_id=$3 AND t.deleted_at IS NULL)) FOR KEY SHARE OF u`,
      [tenant, faculty, course],
    );
    if (!row)
      throw new BadRequestException(
        'Assign an active faculty member responsible for this tenant course',
      );
  }
  private async assertNoUfm(tx: Query, tenant: string, student: string) {
    const rows = await tx.query<Row[]>(
      "SELECT 1 FROM ufm_cases WHERE tenant_id=$1 AND student_user_id=$2 AND status<>'CLOSED' AND marks_locked=true LIMIT 1",
      [tenant, student],
    );
    if (rows[0])
      throw new BadRequestException(
        'An open disciplinary examination hold blocks this retake',
      );
  }
  private async assertFailedEnrollment(tx: Query, tenant: string, a: Row) {
    const [enrollment] = await tx.query<Row[]>(
      `SELECT e.course_id FROM student_course_enrollments e
      JOIN student_exam_reports r ON r.tenant_id=e.tenant_id AND r.student_user_id=e.student_user_id AND r.course_id=e.course_id
      JOIN exam_result_sessions s ON s.tenant_id=r.tenant_id AND s.session_id=r.session_id AND s.semester=e.semester
      WHERE e.tenant_id=$1 AND e.student_user_id=$2 AND e.course_id=$3 AND e.semester=$4
      AND e.status='FAILED' AND r.report_id=$5 AND r.result_status='FAIL' AND s.declared_at IS NOT NULL FOR UPDATE OF e,r`,
      [tenant, a.student_user_id, a.course_id, a.semester, a.source_report_id],
    );
    if (!enrollment)
      throw new BadRequestException(
        'The declared source and current enrollment must still be failed before retake approval or publication',
      );
  }
  private async requirePayment(tx: Query, a: Row) {
    if (a.fee_mode === 'NO_FEE' && Number(a.fee_amount) === 0) return;
    const [paid] = await tx.query<Row[]>(
      `SELECT d.demand_id FROM finance_fee_demands d WHERE d.tenant_id=$1 AND d.student_user_id=$2 AND d.demand_id=$3
      AND d.fee_head='BACKLOG' AND d.status='PAID' AND d.total_amount=$4 AND d.paid_amount>=d.total_amount
      AND COALESCE((SELECT SUM(t.amount) FROM finance_transactions t WHERE t.demand_id=d.demand_id AND t.student_user_id=d.student_user_id
        AND (t.tenant_id IS NULL OR t.tenant_id=d.tenant_id) AND t.status='SUCCESS' AND (t.direction IS NULL OR t.direction='IN')
        AND COALESCE(t.gateway_payload->>'mock','false')='false'),0)>=d.total_amount FOR SHARE OF d`,
      [a.tenant_id, a.student_user_id, a.finance_demand_id, a.fee_amount],
    );
    if (!paid)
      throw new BadRequestException(
        'A settled payment for this student and configured retake demand is required',
      );
  }
  private requireGradeRules(rules: Record<string, unknown> | undefined) {
    const raw = rules?.bands ?? rules?.gradeBands ?? rules?.grades;
    if (
      !Array.isArray(raw) ||
      !raw.length ||
      raw.some((value: unknown) => {
        if (!value || typeof value !== 'object') return true;
        const band = value as Record<string, unknown>;
        return (
          !Number.isFinite(Number(band.minPercent ?? band.min_percent)) ||
          !Number.isFinite(Number(band.maxPercent ?? band.max_percent)) ||
          !Number.isFinite(Number(band.gradePoints ?? band.grade_points)) ||
          typeof band.grade !== 'string'
        );
      })
    )
      throw new BadRequestException(
        'Select a grading policy with explicit grade bands',
      );
    const bands = parseGradeBands(rules);
    if (
      bands[0].maxPercent !== 100 ||
      bands[bands.length - 1].minPercent !== 0 ||
      bands.some(
        (band, index) =>
          band.minPercent < 0 ||
          band.maxPercent > 100 ||
          band.minPercent > band.maxPercent ||
          (index > 0 &&
            Math.abs(bands[index - 1].minPercent - band.maxPercent - 0.01) >
              0.0001),
      )
    )
      throw new BadRequestException(
        'Configured grade bands must cover all percentages without overlaps or gaps',
      );
    return bands;
  }
  private log(
    tx: Query,
    tenant: string,
    actor: string,
    action: string,
    id: string,
    value: Record<string, unknown>,
  ) {
    return this.audit.log(
      tenant,
      actor,
      {
        action,
        resource_type: 'backlog_attempt',
        resource_id: id,
        new_value: value,
      },
      tx,
    );
  }
}

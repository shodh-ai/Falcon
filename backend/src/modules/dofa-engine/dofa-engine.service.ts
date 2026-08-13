import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { DOFA_DECISION, DOFA_STATUS } from './dofa.constants';

export type DofaDomain =
  | 'P2P'
  | 'HR_HIRE'
  | 'GRADE_CHANGE'
  | 'ASSET_WRITEOFF'
  | 'MOU'
  | 'SPACE'
  | 'ESM_EXCEPTION';

type MatrixRow = {
  matrix_id: string;
  domain: string;
  rule_key: string;
  amount_min: string | number | null;
  amount_max: string | number | null;
  required_roles: string[];
  required_signatures: number;
  exception_escalate_role: string;
};

@Injectable()
export class DofaEngineService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private roleAliases(role: string): string[] {
    const r = role.toLowerCase();
    const map: Record<string, string[]> = {
      hr: ['hr', 'hradmin'],
      hradmin: ['hr', 'hradmin'],
      examcell: ['examcell', 'examadmin', 'deputycoe'],
      examadmin: ['examcell', 'examadmin', 'deputycoe'],
      deputycoe: ['examcell', 'examadmin', 'deputycoe'],
      cfo: ['cfo', 'financecontroller'],
      financecontroller: ['cfo', 'financecontroller'],
      accountant: ['accountant', 'apmanager', 'cfo'],
      dean: ['dean'],
      president: ['president', 'chairman'],
      chairman: ['chairman', 'president'],
    };
    return map[r] ?? [r];
  }

  roleMatches(requiredRole: string, userRole: string): boolean {
    const need = this.roleAliases(requiredRole);
    const have = this.roleAliases(userRole);
    return need.some((n) => have.includes(n));
  }

  private matchesAnyRole(requiredRole: string, userRoles: string[]): boolean {
    return userRoles.some((role) => this.roleMatches(requiredRole, role));
  }

  async resolveMatrix(
    tenantId: string | undefined,
    domain: DofaDomain,
    amount?: number | null,
    ruleKey?: string,
  ): Promise<MatrixRow> {
    const tid = this.tenant(tenantId);
    const rows: MatrixRow[] = await this.db.query(
      `SELECT * FROM dofa_matrices
       WHERE is_active AND domain = $1
         AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY tenant_id NULLS LAST, amount_min NULLS FIRST`,
      [domain, tid],
    );
    if (!rows.length) {
      throw new BadRequestException({
        message: `No DOFA matrix for domain ${domain}`,
        code: 'DOFA_MATRIX_MISSING',
      });
    }

    if (ruleKey) {
      const hit = rows.find((r) => r.rule_key === ruleKey);
      if (hit) return hit;
    }

    if (amount != null && Number.isFinite(Number(amount))) {
      const amt = Number(amount);
      const band = rows.find((r) => {
        const min = r.amount_min == null ? -Infinity : Number(r.amount_min);
        const max = r.amount_max == null ? Infinity : Number(r.amount_max);
        return amt >= min && amt <= max;
      });
      if (band) return band;
      // Over all bands → escalate path using highest band or exception
      const over = rows
        .filter((r) => r.amount_max != null)
        .sort((a, b) => Number(b.amount_max) - Number(a.amount_max))[0];
      if (over && amt > Number(over.amount_max)) {
        return {
          ...over,
          required_roles: [over.exception_escalate_role || 'Chairman'],
          required_signatures: 1,
          rule_key: 'EXCEPTION_OVER_LIMIT',
        };
      }
    }

    return rows.find((r) => r.rule_key === 'DEFAULT') ?? rows[0];
  }

  async openCase(
    tenantId: string | undefined,
    input: {
      domain: DofaDomain;
      title: string;
      requester_id: string;
      amount?: number | null;
      source_table?: string;
      source_id?: string;
      payload?: Record<string, unknown>;
      rule_key?: string;
      escalate_now?: boolean;
      exception_reason?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    const matrix = await this.resolveMatrix(
      tid,
      input.domain,
      input.amount,
      input.rule_key,
    );

    const escalate =
      input.escalate_now || matrix.rule_key === 'EXCEPTION_OVER_LIMIT';
    const roles = escalate
      ? [matrix.exception_escalate_role || 'Chairman']
      : matrix.required_roles;
    const status = escalate ? DOFA_STATUS.ESCALATED : DOFA_STATUS.PENDING;

    const cases = await this.db.query(
      `INSERT INTO dofa_cases (
         tenant_id, domain, source_table, source_id, requester_id, title,
         amount, payload, status, current_step, matrix_id, exception_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,0,$10,$11)
       RETURNING *`,
      [
        tid,
        input.domain,
        input.source_table ?? null,
        input.source_id ?? null,
        input.requester_id,
        input.title,
        input.amount ?? null,
        JSON.stringify(input.payload ?? {}),
        status,
        matrix.matrix_id,
        input.exception_reason ??
          (escalate ? 'Escalated per DOFA matrix' : null),
      ],
    );
    const c = cases[0];

    let stepNo = 0;
    for (const role of roles) {
      await this.db.query(
        `INSERT INTO dofa_case_steps (case_id, step_no, required_role)
         VALUES ($1,$2,$3)`,
        [c.case_id, stepNo++, role],
      );
    }

    return this.getCase(tid, c.case_id);
  }

  async getCase(tenantId: string | undefined, caseId: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM dofa_cases WHERE case_id = $1 AND tenant_id = $2`,
      [caseId, tid],
    );
    if (!rows[0]) throw new NotFoundException('DOFA case not found');
    const steps = await this.db.query(
      `SELECT * FROM dofa_case_steps WHERE case_id = $1 ORDER BY step_no`,
      [caseId],
    );
    return { ...rows[0], steps };
  }

  async inbox(tenantId: string | undefined, userRoles: string | string[]) {
    const tid = this.tenant(tenantId);
    const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
    const cases = await this.db.query(
      `SELECT c.*, s.required_role AS awaiting_role, s.step_no AS awaiting_step
       FROM dofa_cases c
       JOIN dofa_case_steps s ON s.case_id = c.case_id AND s.step_no = c.current_step
       WHERE c.tenant_id = $1 AND c.status = ANY($2::text[])
         AND s.decision IS NULL
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [tid, [DOFA_STATUS.PENDING, DOFA_STATUS.ESCALATED]],
    );

    const filtered = cases.filter((c: { awaiting_role: string }) =>
      this.matchesAnyRole(c.awaiting_role, roles),
    );

    // Project open P2P PRs awaiting this role's DOFA level (read-only projection)
    let p2p: unknown[] = [];
    try {
      p2p = await this.db.query(
        `SELECT pr.pr_id AS source_id, pr.description AS title, pr.amount_estimate AS amount,
                pr.status, pr.required_level, 'P2P' AS domain, 'fin_purchase_requisitions' AS source_table,
                'PROJECTION' AS case_id
         FROM fin_purchase_requisitions pr
         WHERE pr.tenant_id = $1 AND pr.status LIKE 'PENDING_L%'
         ORDER BY pr.updated_at DESC
         LIMIT 50`,
        [tid],
      );
      const levelMap: Record<string, number[]> = {
        hod: [1],
        labadmin: [1],
        dean: [2],
        campusadmin: [2],
        procurementhead: [3],
        financecontroller: [3],
        cfo: [3],
        coo: [4],
        chairman: [5],
        president: [5],
      };
      const levels = Array.from(
        new Set(roles.flatMap((role) => levelMap[role.toLowerCase()] ?? [])),
      );
      p2p = (p2p as { required_level: number; status: string }[]).filter(
        (p) =>
          levels.includes(Number(p.required_level)) ||
          levels.some((l) => String(p.status) === `PENDING_L${l}`),
      );
    } catch {
      p2p = [];
    }

    return { cases: filtered, p2p_projections: p2p };
  }

  async exceptions(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM dofa_cases
       WHERE tenant_id = $1 AND status = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [this.tenant(tenantId), DOFA_STATUS.ESCALATED],
    );
  }

  async decide(
    tenantId: string | undefined,
    userId: string,
    userRoles: string | string[],
    caseId: string,
    body: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    const tid = this.tenant(tenantId);
    const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
    const c = await this.getCase(tid, caseId);
    if (
      ![DOFA_STATUS.PENDING, DOFA_STATUS.ESCALATED].includes(
        c.status as typeof DOFA_STATUS.PENDING,
      )
    ) {
      throw new BadRequestException({
        message: `Case is ${c.status}`,
        code: 'DOFA_CASE_CLOSED',
      });
    }
    if (String(c.requester_id) === userId) {
      throw new BadRequestException({
        message: 'Maker cannot approve own DOFA case',
        code: 'SOD_VIOLATION',
      });
    }

    const step = (
      c.steps as Array<{
        step_no: number;
        required_role: string;
        decision: string | null;
        step_id: string;
      }>
    ).find((s) => s.step_no === Number(c.current_step));
    if (!step || step.decision) {
      throw new BadRequestException('No open step');
    }
    if (!this.matchesAnyRole(step.required_role, roles)) {
      throw new ForbiddenException({
        message: `Your roles (${roles.join(', ')}) cannot sign step requiring ${step.required_role}`,
        code: 'DOFA_ROLE_MISMATCH',
      });
    }

    await this.db.query(
      `UPDATE dofa_case_steps
       SET decided_by = $2, decision = $3, notes = $4, decided_at = NOW()
       WHERE case_id = $1 AND step_no = $5`,
      [caseId, userId, body.decision, body.notes ?? null, step.step_no],
    );

    if (body.decision === DOFA_DECISION.REJECTED) {
      await this.db.query(
        `UPDATE dofa_cases SET status = $2, updated_at = NOW() WHERE case_id = $1`,
        [caseId, DOFA_STATUS.REJECTED],
      );
      await this.applyDomainCallback(
        tid,
        caseId,
        DOFA_DECISION.REJECTED,
        userId,
      );
      return this.getCase(tid, caseId);
    }

    await this.syncDomainStepProgress(tid, c, step, userId, body.decision);

    const nextStep = Number(c.current_step) + 1;
    const steps = c.steps as Array<{ step_no: number }>;
    if (nextStep >= steps.length) {
      await this.db.query(
        `UPDATE dofa_cases SET status = $3, current_step = $2, updated_at = NOW()
         WHERE case_id = $1`,
        [caseId, nextStep, DOFA_STATUS.APPROVED],
      );
      await this.applyDomainCallback(
        tid,
        caseId,
        DOFA_DECISION.APPROVED,
        userId,
      );
    } else {
      await this.db.query(
        `UPDATE dofa_cases SET current_step = $2, status = $3, updated_at = NOW()
         WHERE case_id = $1`,
        [caseId, nextStep, DOFA_STATUS.PENDING],
      );
    }
    return this.getCase(tid, caseId);
  }

  /** Keep domain records in sync after each approval step (not only terminal). */
  private async syncDomainStepProgress(
    tenantId: string,
    caseRow: { domain: string; source_id?: string | null },
    completedStep: { required_role: string },
    userId: string,
    decision: string,
  ) {
    if (decision !== DOFA_DECISION.APPROVED || !caseRow.source_id) return;
    const domain = String(caseRow.domain);
    const sourceId = caseRow.source_id;
    const role = completedStep.required_role.toLowerCase();

    if (domain === 'GRADE_CHANGE' && role === 'hod') {
      await this.db.query(
        `UPDATE sis_grade_change_requests
         SET hod_by = $2, hod_at = NOW(), status = 'AWAITING_COE', updated_at = NOW()
         WHERE change_id = $1 AND tenant_id = $3`,
        [sourceId, userId, tenantId],
      );
      await this.notifyGradeChangeAwaitingCoe(tenantId, sourceId);
    }
  }

  private async loadGradeChangeNotifyRow(tenantId: string, changeId: string) {
    const rows = await this.db.query(
      `SELECT g.change_id, g.course_code, g.from_grade, g.to_grade,
              g.requested_by, g.student_user_id,
              req.name AS requester_name, stu.name AS student_name
       FROM sis_grade_change_requests g
       LEFT JOIN users req ON req.user_id = g.requested_by
       LEFT JOIN users stu ON stu.user_id = g.student_user_id
       WHERE g.change_id = $1 AND g.tenant_id = $2
       LIMIT 1`,
      [changeId, tenantId],
    );
    return rows[0] as
      | {
          change_id: string;
          course_code: string;
          from_grade: string;
          to_grade: string;
          requested_by: string;
          student_user_id: string;
          requester_name?: string | null;
          student_name?: string | null;
        }
      | undefined;
  }

  private async notifyGradeChangeAwaitingCoe(
    tenantId: string,
    changeId: string,
  ) {
    const row = await this.loadGradeChangeNotifyRow(tenantId, changeId);
    if (!row) return;

    const base = {
      changeId: String(row.change_id),
      courseCode: row.course_code,
      fromGrade: row.from_grade,
      toGrade: row.to_grade,
      requesterName: row.requester_name ?? 'Faculty',
      studentName: row.student_name ?? null,
    };

    const officers = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND lower(r.role_name) IN ('examcell', 'examadmin', 'deputycoe', 'superadmin')`,
      [tenantId],
    );
    for (const officer of officers) {
      if (String(officer.user_id) === String(row.requested_by)) continue;
      this.notify.gradeChangeCoePending({
        tenantId,
        userId: String(officer.user_id),
        ...base,
        actionLink: '/exam-cell/approvals/grade-change',
      });
    }

    if (row.requested_by) {
      this.notify.gradeChangeCoePending({
        tenantId,
        userId: String(row.requested_by),
        ...base,
        title: 'Grade change sent to Exam Cell',
        message: `HOD approved ${row.course_code}: ${row.from_grade}→${row.to_grade}. Exam Cell (COE) will apply the change.`,
        actionLink: '/faculty/grade-change',
      });
    }
  }

  private async notifyGradeChangeResolved(
    tenantId: string,
    changeId: string,
    decision: 'APPLIED' | 'REJECTED',
  ) {
    const row = await this.loadGradeChangeNotifyRow(tenantId, changeId);
    if (!row?.requested_by) return;
    this.notify.gradeChangeResolved({
      tenantId,
      userId: String(row.requested_by),
      changeId: String(row.change_id),
      courseCode: row.course_code,
      fromGrade: row.from_grade,
      toGrade: row.to_grade,
      requesterName: row.requester_name ?? 'Faculty',
      studentName: row.student_name ?? null,
      decision,
      actionLink: '/faculty/grade-change',
    });
  }

  /** Domain side-effects when case reaches terminal state */
  private async applyDomainCallback(
    tenantId: string,
    caseId: string,
    outcome: 'APPROVED' | 'REJECTED',
    userId?: string,
  ) {
    const c = await this.getCase(tenantId, caseId);
    const domain = String(c.domain);
    const sourceId = c.source_id;

    if (domain === 'HR_HIRE' && sourceId) {
      if (outcome === 'APPROVED') {
        await this.db.query(
          `UPDATE hr_headcount_requests
           SET status = 'APPROVED', offer_sent_at = NOW(), updated_at = NOW()
           WHERE request_id = $1 AND tenant_id = $2`,
          [sourceId, tenantId],
        );
      } else {
        await this.db.query(
          `UPDATE hr_headcount_requests
           SET status = 'REJECTED', updated_at = NOW()
           WHERE request_id = $1 AND tenant_id = $2`,
          [sourceId, tenantId],
        );
      }
    }

    if (domain === 'GRADE_CHANGE' && sourceId) {
      if (outcome === 'APPROVED') {
        if (userId) {
          await this.db.query(
            `UPDATE sis_grade_change_requests
             SET status = 'APPLIED', applied_at = NOW(), coe_by = $3, coe_at = NOW(), updated_at = NOW()
             WHERE change_id = $1 AND tenant_id = $2`,
            [sourceId, tenantId, userId],
          );
        } else {
          await this.db.query(
            `UPDATE sis_grade_change_requests
             SET status = 'APPLIED', applied_at = NOW(), updated_at = NOW()
             WHERE change_id = $1 AND tenant_id = $2`,
            [sourceId, tenantId],
          );
        }
        await this.notifyGradeChangeResolved(tenantId, sourceId, 'APPLIED');
      } else {
        await this.db.query(
          `UPDATE sis_grade_change_requests
           SET status = 'REJECTED', updated_at = NOW()
           WHERE change_id = $1 AND tenant_id = $2`,
          [sourceId, tenantId],
        );
        await this.notifyGradeChangeResolved(tenantId, sourceId, 'REJECTED');
      }
    }

    if (domain === 'ASSET_WRITEOFF' && sourceId) {
      if (outcome === 'APPROVED') {
        await this.db.query(
          `UPDATE asset_writeoff_requests
           SET status = 'WRITTEN_OFF', finance_at = NOW(), updated_at = NOW()
           WHERE writeoff_id = $1::uuid AND tenant_id = $2::uuid`,
          [sourceId, tenantId],
        );
        const assetRows: Array<{ asset_id?: string }> = await this.db.query(
          `SELECT asset_id FROM asset_writeoff_requests
           WHERE writeoff_id = $1::uuid AND tenant_id = $2::uuid`,
          [sourceId, tenantId],
        );
        const assetId = assetRows[0]?.asset_id;
        if (assetId) {
          await this.db.query(
            `UPDATE university_assets
             SET status = 'WRITTEN_OFF', book_value = 0
             WHERE asset_id = $1::uuid AND tenant_id = $2::uuid`,
            [assetId, tenantId],
          );
        }
      } else {
        await this.db.query(
          `UPDATE asset_writeoff_requests
           SET status = 'REJECTED', updated_at = NOW()
           WHERE writeoff_id = $1 AND tenant_id = $2`,
          [sourceId, tenantId],
        );
      }
    }
  }

  async openHeadcountRequest(
    tenantId: string | undefined,
    requesterId: string,
    body: {
      job_title: string;
      department?: string;
      ctc_annual: number;
      candidate_email?: string;
      candidate_name?: string;
    },
  ) {
    if (!body.job_title?.trim() || !(body.ctc_annual > 0)) {
      throw new BadRequestException('job_title and ctc_annual required');
    }
    const tid = this.tenant(tenantId);
    const req = await this.db.query(
      `INSERT INTO hr_headcount_requests (
         tenant_id, requested_by, job_title, department, ctc_annual,
         candidate_email, candidate_name, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_DOFA')
       RETURNING *`,
      [
        tid,
        requesterId,
        body.job_title.trim(),
        body.department ?? null,
        body.ctc_annual,
        body.candidate_email ?? null,
        body.candidate_name ?? null,
      ],
    );
    const row = req[0];
    const escalate = body.ctc_annual >= 1500000;
    const dofa = await this.openCase(tid, {
      domain: 'HR_HIRE',
      title: `Hire: ${body.job_title} @ ₹${body.ctc_annual.toLocaleString('en-IN')}/yr`,
      requester_id: requesterId,
      amount: body.ctc_annual,
      source_table: 'hr_headcount_requests',
      source_id: row.request_id,
      payload: {
        candidate_email: body.candidate_email,
        candidate_name: body.candidate_name,
      },
      escalate_now: escalate,
      exception_reason: escalate
        ? 'CTC ≥ ₹15L — Chairman exception'
        : undefined,
    });
    await this.db.query(
      `UPDATE hr_headcount_requests SET dofa_case_id = $2 WHERE request_id = $1`,
      [row.request_id, dofa.case_id],
    );
    return { ...row, dofa_case_id: dofa.case_id, dofa };
  }

  listHeadcount(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM hr_headcount_requests WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }
}

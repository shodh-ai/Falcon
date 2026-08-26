import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { DOFA_DECISION, DOFA_STATUS } from './dofa.constants';

export type DofaDomain =
  | 'P2P'
  | 'ACQUISITION'
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

    if (String(c.domain) === 'ACQUISITION') {
      await this.assertAcquisitionBudgetActive(tid, String(c.source_id));
      const priorSigner = await this.db.query(
        `SELECT 1 FROM acq_approval_decisions
         WHERE dofa_case_id = $1 AND approver_id = $2 LIMIT 1`,
        [caseId, userId],
      );
      if (priorSigner[0]) {
        throw new BadRequestException({
          message: 'The same user cannot sign multiple acquisition approval levels',
          code: 'DISTINCT_SIGNER_REQUIRED',
        });
      }
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

    await this.db.transaction(async (manager) => {
      const decided = await manager.query(
        `UPDATE dofa_case_steps
         SET decided_by = $2, decision = $3, notes = $4, decided_at = NOW()
         WHERE case_id = $1 AND step_no = $5 AND decision IS NULL
         RETURNING decided_at`,
        [caseId, userId, body.decision, body.notes ?? null, step.step_no],
      );
      if (!decided[0]) {
        throw new ConflictException({
          message: 'Approval step was already decided',
          code: 'DOFA_DECISION_REPLAY',
        });
      }
      if (String(c.domain) !== 'ACQUISITION') return;
      const actualRole =
        roles.find((role) => this.roleMatches(step.required_role, role)) ??
        step.required_role;
      const approvalLevel = step.step_no + 1;
      const previous = await manager.query(
        `SELECT decision_hash FROM acq_approval_decisions
         WHERE dofa_case_id = $1 ORDER BY approval_level DESC LIMIT 1 FOR UPDATE`,
        [caseId],
      );
      const previousHash = previous[0]?.decision_hash ?? null;
      const decisionAt = decided[0].decided_at;
      const decisionHash = createHash('sha256')
        .update(JSON.stringify({
          tenant_id: tid,
          acquisition_version_id: c.source_id,
          dofa_case_id: caseId,
          approval_level: approvalLevel,
          approver_id: userId,
          approver_role: actualRole,
          decision: body.decision,
          comment: body.notes ?? null,
          decision_at: decisionAt,
          previous_decision_hash: previousHash,
        }))
        .digest('hex');
      await manager.query(
        `INSERT INTO acq_approval_decisions (
           tenant_id, acquisition_version_id, dofa_case_id, approval_level,
           approver_id, approver_role, decision, comment, decision_at,
           decision_hash, previous_decision_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tid, c.source_id, caseId, approvalLevel, userId, actualRole,
          body.decision, body.notes ?? null, decisionAt, decisionHash, previousHash],
      );
    });

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

    if (domain === 'ACQUISITION' && sourceId) {
      await this.finalizeAcquisition(
        tenantId,
        sourceId,
        outcome,
        userId ?? null,
      );
    }

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

  private acquisitionFundingTable(type: string) {
    if (type === 'DEPARTMENT')
      return { table: 'fin_dept_budgets', id: 'budget_id' };
    if (type === 'PROGRAM')
      return { table: 'fin_program_budgets', id: 'program_id' };
    if (type === 'RESEARCH_GRANT')
      return { table: 'research_grants', id: 'grant_id' };
    if (type === 'INSTITUTIONAL')
      return {
        table: 'fin_university_budgets',
        id: 'university_budget_id',
      };
    return { table: 'acq_funding_sources', id: 'funding_source_id' };
  }

  private async assertAcquisitionBudgetActive(
    tenantId: string,
    versionId: string,
  ) {
    const rows = await this.db.query(
      `SELECT r.*,
         (SELECT event_type FROM acq_budget_reservation_events e
          WHERE e.budget_reservation_id = r.budget_reservation_id
          ORDER BY e.created_at DESC LIMIT 1) AS latest_event
       FROM acq_budget_reservations r
       WHERE r.acquisition_version_id = $1 AND r.tenant_id = $2`,
      [versionId, tenantId],
    );
    const reservation = rows[0];
    if (!reservation || reservation.latest_event !== 'RESERVED') {
      throw new BadRequestException({
        message: 'Acquisition does not have an active budget reservation',
        code: 'BUDGET_RESERVATION_INACTIVE',
      });
    }
    if (new Date(reservation.expires_at).getTime() <= Date.now()) {
      await this.releaseAcquisitionBudget(
        tenantId,
        versionId,
        'Reservation expired before approval',
        null,
        'EXPIRED',
      );
      await this.db.query(
        `UPDATE acq_request_versions SET status = 'EXPIRED', updated_at = NOW()
         WHERE acquisition_version_id = $1 AND tenant_id = $2`,
        [versionId, tenantId],
      );
      throw new BadRequestException({
        message: 'Budget reservation expired; create an amendment to retry',
        code: 'BUDGET_RESERVATION_EXPIRED',
      });
    }
    return reservation;
  }

  private async releaseAcquisitionBudget(
    tenantId: string,
    versionId: string,
    reason: string,
    actorId: string | null,
    eventType: 'RELEASED' | 'EXPIRED' = 'RELEASED',
  ) {
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM acq_budget_reservations
         WHERE acquisition_version_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [versionId, tenantId],
      );
      const reservation = rows[0];
      if (!reservation) return;
      const latest = await manager.query(
        `SELECT event_type FROM acq_budget_reservation_events
         WHERE budget_reservation_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [reservation.budget_reservation_id],
      );
      if (latest[0]?.event_type !== 'RESERVED') return;
      const source = this.acquisitionFundingTable(
        reservation.funding_source_type,
      );
      await manager.query(
        `UPDATE ${source.table}
         SET encumbered_amount = GREATEST(0, COALESCE(encumbered_amount,0) - $2)
         WHERE ${source.id} = $1 AND tenant_id = $3`,
        [reservation.funding_source_id, reservation.amount, tenantId],
      );
      await manager.query(
        `INSERT INTO acq_budget_reservation_events
           (budget_reservation_id, tenant_id, event_type, reason, actor_user_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          reservation.budget_reservation_id,
          tenantId,
          eventType,
          reason,
          actorId,
        ],
      );
    });
  }

  private async finalizeAcquisition(
    tenantId: string,
    versionId: string,
    outcome: 'APPROVED' | 'REJECTED',
    actorId: string | null,
  ) {
    if (outcome === 'REJECTED') {
      await this.releaseAcquisitionBudget(
        tenantId,
        versionId,
        'DOFA rejected acquisition',
        actorId,
      );
      await this.db.query(
        `UPDATE acq_request_versions SET status='REJECTED', updated_at=NOW()
         WHERE acquisition_version_id=$1 AND tenant_id=$2`,
        [versionId, tenantId],
      );
      return;
    }

    const reservation = await this.assertAcquisitionBudgetActive(
      tenantId,
      versionId,
    );
    await this.db.transaction(async (manager) => {
      const versions = await manager.query(
        `SELECT v.*, r.acquisition_number, r.requester_id,
                r.requesting_department_id, r.acquisition_id
         FROM acq_request_versions v
         JOIN acq_requests r ON r.acquisition_id=v.acquisition_id
         WHERE v.acquisition_version_id=$1 AND v.tenant_id=$2 FOR UPDATE`,
        [versionId, tenantId],
      );
      const version = versions[0];
      if (!version) throw new NotFoundException('Acquisition not found');
      if (version.status === 'APPROVED') return;
      if (version.status !== 'PENDING_DOFA') {
        throw new BadRequestException(`Acquisition is ${version.status}`);
      }
      const [lines, route, decisions] = await Promise.all([
        manager.query(
          `SELECT l.*,
             (SELECT jsonb_build_object(
                'recommendation_id', vr.recommendation_id,
                'vendor_id', vr.vendor_id,
                'score', vr.final_score,
                'confidence', vr.confidence,
                'policy_version', vr.scoring_policy_version,
                'factor_scores', vr.factor_scores
              ) FROM acq_vendor_recommendations vr
              WHERE vr.line_id=l.line_id AND vr.vendor_id=l.selected_vendor_id
              LIMIT 1) AS recommendation_snapshot
           FROM acq_lines l
           WHERE l.acquisition_version_id=$1 AND l.line_status='ACTIVE'
           ORDER BY l.line_number`,
          [versionId],
        ),
        manager.query(
          `SELECT * FROM acq_dofa_route_snapshots
           WHERE acquisition_version_id=$1`,
          [versionId],
        ),
        manager.query(
          `SELECT decision_id, approval_level, approver_id, approver_role,
                  decision, decision_at, comment, decision_hash,
                  previous_decision_hash
           FROM acq_approval_decisions
           WHERE acquisition_version_id=$1 ORDER BY approval_level`,
          [versionId],
        ),
      ]);
      const eventId = randomUUID();
      const payload = {
        event_id: eventId,
        event_version: 1,
        acquisition_id: version.acquisition_id,
        acquisition_version_id: versionId,
        acquisition_number: version.acquisition_number,
        version_number: version.version_number,
        tenant: tenantId,
        requester: version.requester_id,
        department: version.requesting_department_id,
        intended_department_or_lab:
          version.intended_lab_or_project ?? version.intended_department_id,
        required_by_date: version.required_by_date,
        priority: version.priority,
        funding_source: {
          type: version.funding_source_type,
          id: version.funding_source_id,
        },
        budget_reservation: reservation,
        approved_amount: version.estimated_total,
        currency: version.currency,
        lines: lines.map((line: Record<string, any>) => ({
          line_id: line.line_id,
          product: line.product_name,
          category: line.category,
          quantity: line.quantity,
          unit: line.unit,
          brand: line.brand,
          model: line.model_number,
          part_number: line.part_number,
          specifications: line.technical_specifications,
          intended_use: line.intended_use,
          selected_vendor: line.selected_vendor_id,
          recommendation_snapshot: line.recommendation_snapshot,
          estimated_cost:
            Number(line.estimated_line_total) +
            Number(line.delivery_cost) +
            Number(line.tax_cost) +
            Number(line.installation_cost) +
            Number(line.service_cost) +
            Number(line.miscellaneous_cost),
          warranty: line.warranty_requirements,
          expected_delivery: line.expected_delivery_days,
          asset_classification: line.item_classification,
          special_procurement_requirements:
            line.special_procurement_requirements,
        })),
        vendor_scoring_policy_version:
          lines[0]?.recommendation_snapshot?.policy_version ?? null,
        vendor_deviation_justification: lines
          .filter((line: Record<string, any>) =>
            Boolean(line.vendor_deviation_justification),
          )
          .map((line: Record<string, any>) => ({
            line_id: line.line_id,
            justification: line.vendor_deviation_justification,
          })),
        dofa: {
          policy_version: route[0]?.policy_version ?? null,
          route_snapshot: route[0] ?? null,
          approval_decisions: decisions,
        },
        snapshot_hash: version.snapshot_hash,
        approved_at: new Date().toISOString(),
      };
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      await manager.query(
        `UPDATE acq_request_versions
         SET status='APPROVED', approved_at=NOW(), updated_at=NOW()
         WHERE acquisition_version_id=$1 AND status='PENDING_DOFA'`,
        [versionId],
      );
      await manager.query(
        `UPDATE acq_lines SET line_status='APPROVED'
         WHERE acquisition_version_id=$1 AND line_status='ACTIVE'`,
        [versionId],
      );
      await manager.query(
        `INSERT INTO acq_outbox_events (
           event_id, tenant_id, aggregate_type, aggregate_id, event_type,
           event_version, payload, payload_hash
         ) VALUES ($1,$2,'ACQUISITION',$3,'AcquisitionApproved.v1',1,$4::jsonb,$5)`,
        [eventId, tenantId, versionId, JSON.stringify(payload), payloadHash],
      );
    });
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

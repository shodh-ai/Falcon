import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { HrChecklistService } from './hr-checklist.service';

@Injectable()
export class HrEssService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly checklists: HrChecklistService,
  ) {}

  async getOnboardingProgress(tenantId: string, entityId: number, userId: string) {
    const pipeline = await this.dataSource.query(
      `SELECT p.* FROM hr_onboarding_pipelines p
       WHERE p.tenant_id = $1 AND p.entity_id = $2 AND p.user_id = $3
       ORDER BY p.created_at DESC LIMIT 1`,
      [tenantId, entityId, userId],
    );
    if (!pipeline[0]) {
      return { pipeline: null, steps: [], progress_percent: 100, is_new_hire: false };
    }
    const steps = await this.dataSource.query(
      `SELECT * FROM hr_onboarding_steps WHERE pipeline_id = $1 ORDER BY sort_order ASC`,
      [pipeline[0].pipeline_id],
    );
    return { pipeline: pipeline[0], steps, progress_percent: pipeline[0].progress_percent, is_new_hire: true };
  }

  async createOnboardingPipeline(
    tenantId: string,
    entityId: number,
    applicantId: string,
    userId: string,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_onboarding_pipelines (tenant_id, entity_id, applicant_id, user_id, stage, progress_percent)
       VALUES ($1,$2,$3,$4,'DOCUMENTS',0)
       RETURNING *`,
      [tenantId, entityId, applicantId, userId],
    );
    const pipelineId = rows[0].pipeline_id;
    const stepDefs = [
      { key: 'PAN_UPLOAD', label: 'Upload PAN', order: 1 },
      { key: 'OFFER_LETTER', label: 'Sign Offer Letter', order: 2 },
      { key: 'POLICIES', label: 'Read Policies', order: 3 },
      { key: 'ID_CARD_PHOTO', label: 'ID Card Photo', order: 4 },
    ];
    for (const step of stepDefs) {
      await this.dataSource.query(
        `INSERT INTO hr_onboarding_steps (pipeline_id, step_key, step_label, sort_order)
         VALUES ($1,$2,$3,$4) ON CONFLICT (pipeline_id, step_key) DO NOTHING`,
        [pipelineId, step.key, step.label, step.order],
      );
    }
    return rows[0];
  }

  async completeOnboardingStep(pipelineId: string, stepKey: string) {
    await this.dataSource.query(
      `UPDATE hr_onboarding_steps SET status = 'COMPLETED', completed_at = NOW()
       WHERE pipeline_id = $1 AND step_key = $2`,
      [pipelineId, stepKey],
    );
    const counts = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS done
       FROM hr_onboarding_steps WHERE pipeline_id = $1`,
      [pipelineId],
    );
    const total = counts[0]?.total ?? 4;
    const done = counts[0]?.done ?? 0;
    const pct = Math.round((done / total) * 100);
    const stage = pct >= 100 ? 'COMPLETED' : done >= 2 ? 'POLICIES' : done >= 1 ? 'OFFER' : 'DOCUMENTS';
    await this.dataSource.query(
      `UPDATE hr_onboarding_pipelines SET progress_percent = $2, stage = $3, updated_at = NOW()
       WHERE pipeline_id = $1`,
      [pipelineId, pct, stage],
    );
    return { progress_percent: pct, stage };
  }

  async listOnboardingKanban(tenantId: string, entityId: number) {
    const applicants = await this.dataSource.query(
      `SELECT a.*, j.title AS job_title, p.pipeline_id, p.progress_percent, p.stage
       FROM hr_applicants a
       LEFT JOIN hr_job_postings j ON j.job_id = a.job_id
       LEFT JOIN hr_onboarding_pipelines p ON p.applicant_id = a.applicant_id
       WHERE a.tenant_id = $1 AND a.entity_id = $2
       ORDER BY a.created_at ASC`,
      [tenantId, entityId],
    );
    for (const a of applicants) {
      if (a.pipeline_id) {
        const prog = await this.checklists.getPipelineChecklistProgress(a.pipeline_id);
        a.checklist_total = prog.total;
        a.checklist_completed = prog.completed;
        a.progress_percent = prog.progress_percent || a.progress_percent;
      }
    }
    const stages = ['APPLIED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED'];
    return {
      stages: stages.map((stage) => ({
        id: stage,
        title: stage.replaceAll('_', ' '),
        cards: applicants.filter((a: { stage: string }) => a.stage === stage),
      })),
    };
  }

  async submitResignation(
    tenantId: string,
    entityId: number,
    userId: string,
    dto: { last_working_day: string; reason: string },
  ) {
    const existing = await this.dataSource.query(
      `SELECT resignation_id FROM hr_resignation_requests
       WHERE user_id = $1 AND status NOT IN ('FNF_COMPLETED', 'REJECTED', 'WITHDRAWN')`,
      [userId],
    );
    if (existing[0]) throw new BadRequestException('Active resignation request already exists');

    const rows = await this.dataSource.query(
      `INSERT INTO hr_resignation_requests (
         tenant_id, entity_id, user_id, last_working_day, reason, status, exit_status
       ) VALUES ($1,$2,$3,$4::date,$5,'PENDING_HOD','PENDING_CLEARANCE')
       RETURNING *`,
      [tenantId, entityId, userId, dto.last_working_day, dto.reason],
    );
    await this.checklists.spawnOffboardingInstances(
      tenantId,
      entityId,
      userId,
      rows[0].resignation_id,
    );
    return rows[0];
  }

  async listResignations(tenantId: string, entityId: number, status?: string) {
    const params: unknown[] = [tenantId, entityId];
    let sql = `SELECT r.*, u.name AS employee_name, p.employee_id,
                      r.exit_status, r.fnf_deduct_checklist_penalty
               FROM hr_resignation_requests r
               JOIN users u ON u.user_id = r.user_id
               LEFT JOIN hr_employee_profiles p ON p.user_id = r.user_id
               WHERE r.tenant_id = $1 AND r.entity_id = $2`;
    if (status) {
      params.push(status);
      sql += ` AND r.status = $3`;
    }
    sql += ` ORDER BY r.created_at DESC`;
    return this.dataSource.query(sql, params);
  }

  async hodClearResignation(resignationId: string, hodUserId: string, approved: boolean) {
    const rows = await this.dataSource.query(
      `UPDATE hr_resignation_requests SET
         status = $2,
         hod_cleared_by = $3,
         hod_cleared_at = NOW(),
         updated_at = NOW()
       WHERE resignation_id = $1
       RETURNING *`,
      [resignationId, approved ? 'PENDING_HR' : 'REJECTED', hodUserId],
    );
    if (!rows[0]) throw new NotFoundException('Resignation request not found');
    return rows[0];
  }

  async hrProcessResignation(
    resignationId: string,
    hrUserId: string,
    separationMode: 'SERVE_NOTICE' | 'BUYOUT_NOTICE' | 'IMMEDIATE_SEPARATION',
  ) {
    const rows = await this.dataSource.query(
      `UPDATE hr_resignation_requests SET
         status = 'FNF_PENDING',
         separation_mode = $2,
         hr_processed_by = $3,
         hr_processed_at = NOW(),
         updated_at = NOW()
       WHERE resignation_id = $1
       RETURNING *`,
      [resignationId, separationMode, hrUserId],
    );
    if (!rows[0]) throw new NotFoundException('Resignation request not found');
    const r = rows[0];

    const fnfRef = `FNF-${resignationId.slice(0, 8).toUpperCase()}`;
    await this.dataSource.query(
      `UPDATE hr_resignation_requests SET fnf_ledger_ref = $2 WHERE resignation_id = $1`,
      [resignationId, fnfRef],
    );

    this.notify.leaveApproved({
      tenantId: r.tenant_id,
      userId: r.user_id,
      leaveType: 'FNF',
      startDate: r.last_working_day,
      endDate: r.last_working_day,
    });

    return { ...r, fnf_ledger_ref: fnfRef, finance_handoff: true };
  }

  async listEmployeeDocuments(tenantId: string, entityId: number, userId: string) {
    return this.dataSource.query(
      `SELECT document_id, document_type, file_url, verification_status, uploaded_at
       FROM hr_employee_documents
       WHERE tenant_id = $1 AND (entity_id = $2 OR entity_id IS NULL) AND user_id = $3
       ORDER BY uploaded_at DESC`,
      [tenantId, entityId, userId],
    );
  }

  async uploadEmployeeDocument(
    tenantId: string,
    entityId: number,
    userId: string,
    dto: { document_type: string; file_url: string },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_documents (tenant_id, entity_id, user_id, document_type, file_url, verification_status)
       VALUES ($1,$2,$3,$4,$5,'VERIFIED')
       RETURNING *`,
      [tenantId, entityId, userId, dto.document_type, dto.file_url],
    );
    return rows[0];
  }

  async listPolicies(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM hr_policy_polls WHERE policy_id = p.policy_id AND vote = 'YES')::int AS favour_count,
              (SELECT COUNT(*) FROM hr_policy_polls WHERE policy_id = p.policy_id AND vote = 'NO')::int AS against_count,
              EXISTS (
                SELECT 1 FROM hr_policy_acknowledgements a
                WHERE a.policy_id = p.policy_id AND a.user_id = $3
              ) AS acknowledged
       FROM hr_policy_documents p
       WHERE p.tenant_id = $1 AND (p.entity_id = $2 OR p.entity_id IS NULL) AND p.is_active = true
       ORDER BY p.category, p.title`,
      [tenantId, entityId, '00000000-0000-0000-0000-000000000000'],
    );
  }

  async listPoliciesForUser(tenantId: string, entityId: number, userId: string) {
    return this.dataSource.query(
      `SELECT p.*,
              (SELECT vote FROM hr_policy_polls WHERE policy_id = p.policy_id AND user_id = $3) AS user_vote,
              EXISTS (
                SELECT 1 FROM hr_policy_acknowledgements a
                WHERE a.policy_id = p.policy_id AND a.user_id = $3
              ) AS acknowledged
       FROM hr_policy_documents p
       WHERE p.tenant_id = $1 AND (p.entity_id = $2 OR p.entity_id IS NULL) AND p.is_active = true
       ORDER BY p.category, p.title`,
      [tenantId, entityId, userId],
    );
  }

  async submitPolicyVote(
    tenantId: string,
    policyId: string,
    userId: string,
    vote: 'YES' | 'NO',
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_policy_polls (policy_id, user_id, vote, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (policy_id, user_id) 
       DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()
       RETURNING *`,
      [policyId, userId, vote],
    );
    return rows[0];
  }

  async acknowledgePolicy(
    tenantId: string,
    policyId: string,
    userId: string,
    ipAddress?: string,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_policy_acknowledgements (tenant_id, policy_id, user_id, ip_address)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (policy_id, user_id) DO UPDATE SET acknowledged_at = NOW()
       RETURNING *`,
      [tenantId, policyId, userId, ipAddress ?? null],
    );
    return rows[0];
  }

  async upsertPolicy(
    tenantId: string,
    entityId: number,
    createdByUserId: string,
    dto: { title: string; category?: string; file_url?: string; is_mandatory?: boolean },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_policy_documents (
         tenant_id, entity_id, title, category, file_url, is_mandatory, created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        entityId,
        dto.title,
        dto.category ?? 'GENERAL',
        dto.file_url ?? null,
        dto.is_mandatory ?? true,
        createdByUserId,
      ],
    );
    return rows[0];
  }

  async deletePolicy(tenantId: string, entityId: number, policyId: string) {
    await this.dataSource.query(
      `UPDATE hr_policy_documents SET is_active = false WHERE tenant_id = $1 AND entity_id = $2 AND policy_id = $3`,
      [tenantId, entityId, policyId],
    );
    return { deleted: true };
  }

  async listArchivedPolicies(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT p.*, false AS acknowledged
       FROM hr_policy_documents p
       WHERE p.tenant_id = $1 AND p.entity_id = $2 AND p.is_active = false
       ORDER BY p.category, p.title`,
      [tenantId, entityId],
    );
  }

  async restorePolicy(tenantId: string, entityId: number, policyId: string) {
    await this.dataSource.query(
      `UPDATE hr_policy_documents SET is_active = true WHERE tenant_id = $1 AND entity_id = $2 AND policy_id = $3`,
      [tenantId, entityId, policyId],
    );
    return { restored: true };
  }

  async getEmployeeCalendar(
    tenantId: string,
    entityId: number,
    userId: string,
    month: string,
  ) {
    const [year, monthNum] = month.split('-').map(Number);
    const start = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = new Date(year, monthNum, 0);
    const end = endDate.toISOString().slice(0, 10);

    const [attendance, holidays, leaves, shift] = await Promise.all([
      this.dataSource.query(
        `SELECT date, calculated_status, first_in_time, last_out_time, total_hours
         FROM hr_daily_attendance WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
        [userId, start, end],
      ),
      this.dataSource.query(
        `SELECT holiday_id, title, date, type FROM hr_holidays
         WHERE date BETWEEN $1 AND $2 AND (entity_id = $3 OR entity_id IS NULL)
           AND applicable_to IN ('ALL', 'STAFF')`,
        [start, end, entityId],
      ),
      this.dataSource.query(
        `SELECT leave_id, leave_type, start_date, end_date, status
         FROM staff_leave_requests
         WHERE staff_user_id = $1 AND tenant_id = $2
           AND status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
           AND start_date <= $4 AND end_date >= $3`,
        [userId, tenantId, start, end],
      ),
      this.dataSource.query(
        `SELECT s.shift_name, s.start_time::text, s.end_time::text
         FROM hr_employee_profiles ep
         LEFT JOIN hr_shifts s ON s.shift_id = ep.shift_id
         WHERE ep.user_id = $1 AND ep.tenant_id = $2 LIMIT 1`,
        [userId, tenantId],
      ),
    ]);

    return { month, shift: shift[0] ?? null, attendance, holidays, leaves };
  }
}

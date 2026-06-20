import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationService } from '../integrations/notification.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { SubmitEcellProjectDto } from './dto/submit-project.dto';
import { UpsertEcellConfigDto } from './dto/upsert-config.dto';
import { EcellApprovalActionDto } from './dto/approval-action.dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['UNDER_L1_REVIEW', 'REJECTED'],
  UNDER_L1_REVIEW: ['L1_APPROVED', 'REJECTED'],
  L1_APPROVED: ['L2_APPROVED', 'REJECTED'],
  L2_APPROVED: ['FUNDED'],
};

@Injectable()
export class EcellService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly integrations: NotificationService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private hasRole(roles: string[] | undefined, roleName: string) {
    const normalized = (roles ?? []).map((r) => r.trim().toLowerCase());
    return normalized.includes(roleName.trim().toLowerCase()) || normalized.includes('superadmin');
  }

  private assertTransition(from: string, to: string) {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Invalid status transition from ${from} to ${to}`);
    }
  }

  private async getActiveConfig(tenantId: string) {
    const rows = await this.db.query(
      `SELECT * FROM ecell_configurations
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    return rows[0] as Record<string, unknown> | undefined;
  }

  private async getProject(tenantId: string, projectId: string) {
    const rows = await this.db.query(
      `SELECT p.*,
              u.name AS student_name,
              u.official_email AS student_email,
              sp.phone AS student_phone,
              sp.bank_details AS student_bank_details,
              c.cohort_name
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.project_id = $1 AND p.tenant_id = $2`,
      [projectId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Project not found');
    return rows[0] as Record<string, unknown>;
  }

  private async assertApproverRole(
    tenantId: string,
    roles: string[] | undefined,
    level: 1 | 2,
  ) {
    const config = await this.getActiveConfig(tenantId);
    if (!config) throw new BadRequestException('No active E-Cell configuration found');
    const required =
      level === 1
        ? String(config.level_1_approver_role)
        : String(config.level_2_approver_role);
    if (!this.hasRole(roles, required) && !this.hasRole(roles, 'ECellAdmin') && !this.hasRole(roles, 'Incubation_Admin')) {
      throw new ForbiddenException(`Requires ${required} role for Level ${level} approval`);
    }
    return config;
  }

  private async notifyStudent(
    tenantId: string,
    studentUserId: string,
    title: string,
    message: string,
    actionLink = '/student/e-cell',
  ) {
    this.notify.ecellStatusUpdated({
      tenantId,
      userId: studentUserId,
      title,
      message,
      actionLink,
    });

    const rows = await this.db.query(
      `SELECT u.phone, sp.phone AS profile_phone
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [studentUserId],
    );
    const phone = (rows[0]?.phone ?? rows[0]?.profile_phone) as string | undefined;
    if (phone) {
      await this.integrations.queueWhatsApp(phone, `${title}: ${message}`);
    }
  }

  async getActiveConfiguration(tenantId?: string) {
    return this.getActiveConfig(this.tenant(tenantId));
  }

  async upsertConfiguration(tenantId: string | undefined, dto: UpsertEcellConfigDto) {
    const tid = this.tenant(tenantId);
    if (dto.is_active !== false) {
      await this.db.query(
        `UPDATE ecell_configurations SET is_active = false, updated_at = NOW() WHERE tenant_id = $1`,
        [tid],
      );
    }
    const rows = await this.db.query(
      `INSERT INTO ecell_configurations (
         tenant_id, cohort_name, is_active, max_funding_limit,
         level_1_approver_role, level_2_approver_role
       ) VALUES ($1, $2, COALESCE($3, true), $4, $5, $6)
       RETURNING *`,
      [
        tid,
        dto.cohort_name,
        dto.is_active ?? true,
        dto.max_funding_limit ?? null,
        dto.level_1_approver_role,
        dto.level_2_approver_role,
      ],
    );
    return rows[0];
  }

  async listConfigurations(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM ecell_configurations
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async submitProject(tenantId: string | undefined, studentUserId: string, dto: SubmitEcellProjectDto) {
    const tid = this.tenant(tenantId);
    const config = await this.getActiveConfig(tid);
    if (!config) {
      throw new BadRequestException('E-Cell incubation is not open for submissions');
    }
    const maxLimit = config.max_funding_limit != null ? Number(config.max_funding_limit) : null;
    if (maxLimit != null && dto.requested_funding > maxLimit) {
      throw new BadRequestException(`Requested funding cannot exceed cohort limit of ₹${maxLimit}`);
    }

    const existing = await this.db.query(
      `SELECT project_id FROM ecell_projects
       WHERE tenant_id = $1 AND student_user_id = $2
         AND current_status NOT IN ('REJECTED', 'FUNDED')
       LIMIT 1`,
      [tid, studentUserId],
    );
    if (existing[0]) {
      throw new BadRequestException('You already have an active incubation pitch in progress');
    }

    const rows = await this.db.query(
      `INSERT INTO ecell_projects (
         tenant_id, config_id, student_user_id, startup_name,
         innovation_description, pitch_deck_url, requested_funding, current_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUBMITTED')
       RETURNING *`,
      [
        tid,
        config.config_id,
        studentUserId,
        dto.startup_name,
        dto.innovation_description,
        dto.pitch_deck_url ?? null,
        dto.requested_funding,
      ],
    );
    return rows[0];
  }

  async listMyProjects(tenantId: string | undefined, studentUserId: string) {
    return this.db.query(
      `SELECT p.*, c.cohort_name,
              (
                SELECT json_agg(a ORDER BY a.approval_level ASC, a.action_date ASC)
                FROM ecell_approvals a
                WHERE a.project_id = p.project_id
              ) AS approvals
       FROM ecell_projects p
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.tenant_id = $1 AND p.student_user_id = $2
       ORDER BY p.submitted_at DESC`,
      [this.tenant(tenantId), studentUserId],
    );
  }

  async listTriageQueue(tenantId?: string) {
    return this.db.query(
      `SELECT p.*, u.name AS student_name, c.cohort_name
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.tenant_id = $1 AND p.current_status = 'SUBMITTED'
       ORDER BY p.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async pushToL1(tenantId: string | undefined, projectId: string) {
    const tid = this.tenant(tenantId);
    const project = await this.getProject(tid, projectId);
    this.assertTransition(String(project.current_status), 'UNDER_L1_REVIEW');
    const rows = await this.db.query(
      `UPDATE ecell_projects
       SET current_status = 'UNDER_L1_REVIEW', updated_at = NOW()
       WHERE project_id = $1 AND tenant_id = $2 AND current_status = 'SUBMITTED'
       RETURNING *`,
      [projectId, tid],
    );
    return rows[0];
  }

  async rejectProject(
    tenantId: string | undefined,
    approverUserId: string,
    projectId: string,
    remarks: string,
    level?: 0 | 1 | 2,
  ) {
    const tid = this.tenant(tenantId);
    const project = await this.getProject(tid, projectId);
    const from = String(project.current_status);
    this.assertTransition(from, 'REJECTED');

    const rows = await this.db.query(
      `UPDATE ecell_projects
       SET current_status = 'REJECTED', updated_at = NOW()
       WHERE project_id = $1 AND tenant_id = $2 AND current_status = $3
       RETURNING *`,
      [projectId, tid, from],
    );
    if (!rows[0]) throw new BadRequestException('Project not found or already processed');

    if (level && level > 0) {
      await this.db.query(
        `INSERT INTO ecell_approvals (
           tenant_id, project_id, approver_user_id, approval_level, status, remarks
         ) VALUES ($1, $2, $3, $4, 'REJECTED', $5)`,
        [tid, projectId, approverUserId, level, remarks],
      );
    }

    const label =
      level === 1 ? 'Level 1 Review' : level === 2 ? 'Level 2 Review' : 'Initial Triage';
    await this.notifyStudent(
      tid,
      String(project.student_user_id),
      'Incubation Pitch Rejected',
      `Your incubation pitch was rejected during ${label}. ${remarks}`,
    );
    return rows[0];
  }

  async listL1Queue(tenantId: string | undefined, roles: string[] | undefined) {
    await this.assertApproverRole(this.tenant(tenantId), roles, 1);
    return this.db.query(
      `SELECT p.*, u.name AS student_name, c.cohort_name
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.tenant_id = $1 AND p.current_status = 'UNDER_L1_REVIEW'
       ORDER BY p.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async approveL1(
    tenantId: string | undefined,
    approverUserId: string,
    roles: string[] | undefined,
    projectId: string,
    dto: EcellApprovalActionDto,
  ) {
    const tid = this.tenant(tenantId);
    await this.assertApproverRole(tid, roles, 1);
    const project = await this.getProject(tid, projectId);
    this.assertTransition(String(project.current_status), 'L1_APPROVED');

    const requested = Number(project.requested_funding);
    const approved = dto.approved_funding_amount ?? requested;
    if (approved <= 0) throw new BadRequestException('Approved funding must be greater than zero');
    if (approved > requested) {
      throw new BadRequestException(`Approved amount cannot exceed requested ₹${requested}`);
    }

    const config = await this.getActiveConfig(tid);
    const maxLimit = config?.max_funding_limit != null ? Number(config.max_funding_limit) : null;
    if (maxLimit != null && approved > maxLimit) {
      throw new BadRequestException(`Approved funding cannot exceed cohort limit of ₹${maxLimit}`);
    }

    const rows = await this.db.query(
      `UPDATE ecell_projects
       SET current_status = 'L1_APPROVED',
           approved_funding_amount = $3,
           updated_at = NOW()
       WHERE project_id = $1 AND tenant_id = $2 AND current_status = 'UNDER_L1_REVIEW'
       RETURNING *`,
      [projectId, tid, approved],
    );
    if (!rows[0]) throw new BadRequestException('Project not found or not awaiting L1 review');

    await this.db.query(
      `INSERT INTO ecell_approvals (
         tenant_id, project_id, approver_user_id, approval_level, status,
         approved_funding_amount, remarks
       ) VALUES ($1, $2, $3, 1, 'APPROVED', $4, $5)`,
      [tid, projectId, approverUserId, approved, dto.remarks ?? null],
    );

    await this.notifyStudent(
      tid,
      String(project.student_user_id),
      'Level 1 Approved',
      `Your Incubation Pitch has passed Level 1 Review! Proposed grant: ₹${approved}.`,
    );
    return rows[0];
  }

  async listL2Queue(tenantId: string | undefined, roles: string[] | undefined) {
    await this.assertApproverRole(this.tenant(tenantId), roles, 2);
    return this.db.query(
      `SELECT p.*, u.name AS student_name, c.cohort_name,
              (
                SELECT row_to_json(a)
                FROM ecell_approvals a
                WHERE a.project_id = p.project_id AND a.approval_level = 1 AND a.status = 'APPROVED'
                ORDER BY a.action_date DESC
                LIMIT 1
              ) AS l1_approval
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.tenant_id = $1 AND p.current_status = 'L1_APPROVED'
       ORDER BY p.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async approveL2(
    tenantId: string | undefined,
    approverUserId: string,
    roles: string[] | undefined,
    projectId: string,
    dto: EcellApprovalActionDto,
  ) {
    const tid = this.tenant(tenantId);
    await this.assertApproverRole(tid, roles, 2);
    const project = await this.getProject(tid, projectId);
    this.assertTransition(String(project.current_status), 'L2_APPROVED');

    const l1Rows = await this.db.query(
      `SELECT approval_id, approved_funding_amount
       FROM ecell_approvals
       WHERE project_id = $1 AND tenant_id = $2 AND approval_level = 1 AND status = 'APPROVED'
       LIMIT 1`,
      [projectId, tid],
    );
    if (!l1Rows[0]) {
      throw new BadRequestException('Level 2 approval requires an existing Level 1 approval record');
    }

    const l1Amount = Number(l1Rows[0].approved_funding_amount ?? project.approved_funding_amount);
    const finalAmount = dto.approved_funding_amount ?? l1Amount;
    if (finalAmount <= 0) throw new BadRequestException('Final funding must be greater than zero');
    if (finalAmount > l1Amount) {
      throw new BadRequestException(`Final amount cannot exceed L1 approved ₹${l1Amount}`);
    }

    const queryRunner = this.db.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const updated = await queryRunner.query(
        `UPDATE ecell_projects
         SET current_status = 'L2_APPROVED',
             approved_funding_amount = $3,
             updated_at = NOW()
         WHERE project_id = $1 AND tenant_id = $2 AND current_status = 'L1_APPROVED'
         RETURNING *`,
        [projectId, tid, finalAmount],
      );
      if (!updated[0]) throw new BadRequestException('Project not found or not awaiting L2 review');

      await queryRunner.query(
        `INSERT INTO ecell_approvals (
           tenant_id, project_id, approver_user_id, approval_level, status,
           approved_funding_amount, remarks
         ) VALUES ($1, $2, $3, 2, 'APPROVED', $4, $5)`,
        [tid, projectId, approverUserId, finalAmount, dto.remarks ?? null],
      );

      const bankRef = project.student_bank_details
        ? JSON.stringify(project.student_bank_details)
        : null;

      const disbursement = await queryRunner.query(
        `INSERT INTO ecell_disbursement_requests (
           tenant_id, project_id, student_user_id, amount, bank_account_ref, status
         ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING *`,
        [tid, projectId, project.student_user_id, finalAmount, bankRef],
      );

      const disbursementId = disbursement[0].disbursement_id as string;
      await this.ledger.postExpense(tid, disbursementId, finalAmount, 0, 0, queryRunner);

      await queryRunner.query(
        `UPDATE ecell_disbursement_requests
         SET status = 'POSTED', journal_source_id = $3, posted_at = NOW()
         WHERE disbursement_id = $1 AND tenant_id = $2`,
        [disbursementId, tid, disbursementId],
      );

      const funded = await queryRunner.query(
        `UPDATE ecell_projects
         SET current_status = 'FUNDED', updated_at = NOW()
         WHERE project_id = $1 AND tenant_id = $2
         RETURNING *`,
        [projectId, tid],
      );

      await queryRunner.commitTransaction();

      await this.notifyStudent(
        tid,
        String(project.student_user_id),
        'Fund Granted',
        `Congratulations! Your E-Cell grant of ₹${finalAmount} has been approved and queued for disbursement.`,
      );

      return { project: funded[0], disbursement: disbursement[0] };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async dashboardSummary(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE current_status = 'SUBMITTED') AS submitted_count,
         COUNT(*) FILTER (WHERE current_status = 'UNDER_L1_REVIEW') AS l1_queue_count,
         COUNT(*) FILTER (WHERE current_status = 'L1_APPROVED') AS l2_queue_count,
         COUNT(*) FILTER (WHERE current_status = 'FUNDED') AS funded_count,
         COUNT(*) FILTER (WHERE current_status = 'REJECTED') AS rejected_count,
         COALESCE(SUM(approved_funding_amount) FILTER (WHERE current_status = 'FUNDED'), 0) AS total_disbursed,
         (SELECT COUNT(*) FROM ecell_configurations c WHERE c.tenant_id = $1 AND c.is_active = true) AS active_cohorts
       FROM ecell_projects
       WHERE tenant_id = $1`,
      [tid],
    );
    return rows[0];
  }

  async exportIncubationReport(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT p.startup_name,
              p.innovation_description,
              p.requested_funding,
              p.approved_funding_amount,
              p.current_status,
              p.submitted_at,
              u.name AS student_name,
              u.official_email AS student_email,
              c.cohort_name,
              d.amount AS disbursed_amount,
              d.posted_at AS disbursement_date
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       LEFT JOIN ecell_disbursement_requests d ON d.project_id = p.project_id AND d.status = 'POSTED'
       WHERE p.tenant_id = $1
       ORDER BY p.submitted_at DESC`,
      [tid],
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Incubation Report');
    sheet.columns = [
      { header: 'Cohort', key: 'cohort_name', width: 22 },
      { header: 'Student', key: 'student_name', width: 24 },
      { header: 'Email', key: 'student_email', width: 28 },
      { header: 'Startup', key: 'startup_name', width: 28 },
      { header: 'Innovation / USP', key: 'innovation_description', width: 48 },
      { header: 'Requested (INR)', key: 'requested_funding', width: 16 },
      { header: 'Approved (INR)', key: 'approved_funding_amount', width: 16 },
      { header: 'Disbursed (INR)', key: 'disbursed_amount', width: 16 },
      { header: 'Status', key: 'current_status', width: 16 },
      { header: 'Submitted At', key: 'submitted_at', width: 22 },
      { header: 'Disbursement Date', key: 'disbursement_date', width: 22 },
    ];
    for (const row of rows as Record<string, unknown>[]) {
      sheet.addRow(row);
    }
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async listDisbursementRequests(tenantId?: string) {
    return this.db.query(
      `SELECT d.*, p.startup_name, u.name AS student_name
       FROM ecell_disbursement_requests d
       JOIN ecell_projects p ON p.project_id = d.project_id
       JOIN users u ON u.user_id = d.student_user_id
       WHERE d.tenant_id = $1
       ORDER BY d.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async listFinancePayoutsSanitized(tenantId?: string) {
    return this.db.query(
      `SELECT d.disbursement_id,
              p.startup_name,
              u.name AS student_name,
              d.amount,
              d.grant_tag,
              d.status,
              d.created_at,
              d.posted_at,
              'Incubation Head' AS approved_by_label
       FROM ecell_disbursement_requests d
       JOIN ecell_projects p ON p.project_id = d.project_id
       JOIN users u ON u.user_id = d.student_user_id
       WHERE d.tenant_id = $1
       ORDER BY d.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async listPortfolio(tenantId?: string) {
    return this.db.query(
      `SELECT p.project_id,
              p.startup_name,
              p.innovation_description,
              p.approved_funding_amount,
              p.submitted_at,
              p.updated_at,
              u.name AS student_name,
              u.official_email AS student_email,
              c.cohort_name,
              d.amount AS disbursed_amount,
              d.posted_at AS funded_at
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       LEFT JOIN ecell_disbursement_requests d ON d.project_id = p.project_id AND d.status = 'POSTED'
       WHERE p.tenant_id = $1 AND p.current_status = 'FUNDED'
       ORDER BY p.updated_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async listPipelineBoard(tenantId?: string) {
    return this.db.query(
      `SELECT p.*,
              u.name AS student_name,
              c.cohort_name,
              (
                SELECT row_to_json(a)
                FROM ecell_approvals a
                WHERE a.project_id = p.project_id AND a.approval_level = 1 AND a.status = 'APPROVED'
                ORDER BY a.action_date DESC
                LIMIT 1
              ) AS l1_approval
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       LEFT JOIN ecell_configurations c ON c.config_id = p.config_id
       WHERE p.tenant_id = $1
         AND p.current_status IN ('UNDER_L1_REVIEW', 'L1_APPROVED', 'L2_APPROVED')
       ORDER BY p.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }
}

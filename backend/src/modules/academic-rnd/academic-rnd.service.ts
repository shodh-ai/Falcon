import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationService } from '../integrations/notification.service';
import { UpsertRndConfigDto } from './dto/upsert-config.dto';
import { SubmitRndApplicationDto } from './dto/submit-application.dto';
import { RndApprovalActionDto, RndRankingDto } from './dto/approval-action.dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['PENDING_GUIDE'],
  PENDING_GUIDE: ['PENDING_BUDGET', 'GUIDE_REJECTED'],
  PENDING_BUDGET: ['PENDING_RANKING', 'BUDGET_REJECTED'],
  PENDING_RANKING: ['GRANT_APPROVED', 'GRANT_REJECTED'],
};

@Injectable()
export class AcademicRndService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly integrations: NotificationService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private assertTransition(from: string, to: string) {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Invalid status transition from ${from} to ${to}`,
      );
    }
  }

  private async notifyStudent(
    tenantId: string,
    studentUserId: string,
    title: string,
    message: string,
  ) {
    this.notify.academicRndStatusUpdated({
      tenantId,
      userId: studentUserId,
      title,
      message,
      actionLink: '/student/research',
    });

    const rows = await this.db.query(
      `SELECT u.phone, sp.phone AS profile_phone
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [studentUserId],
    );
    const phone = (rows[0]?.phone ?? rows[0]?.profile_phone) as
      | string
      | undefined;
    if (phone) {
      await this.integrations.queueWhatsApp(phone, `${title}: ${message}`);
    }
  }

  private async notifyStudentsOfConfig(
    tenantId: string,
    title: string,
    deadline: string | null,
  ) {
    const students = await this.db.query(
      `SELECT user_id FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
      [tenantId],
    );
    const deadlineText = deadline
      ? ` Deadline: ${new Date(deadline).toLocaleDateString('en-IN')}.`
      : '';
    for (const row of students as { user_id: string }[]) {
      this.notify.academicRndStatusUpdated({
        tenantId,
        userId: row.user_id,
        title: 'Research Grant Call Open',
        message: `${title} is now open for applications.${deadlineText}`,
        actionLink: '/student/research',
      });
    }
  }

  private async resolveGuideFaculty(tenantId: string, studentUserId: string) {
    const rows = await this.db.query(
      `SELECT g.faculty_user_id
       FROM project_guide_students pgs
       JOIN faculty_project_guides g ON g.guide_id = pgs.guide_id
       WHERE pgs.student_user_id = $1 AND pgs.tenant_id = $2
       ORDER BY g.created_at DESC NULLS LAST
       LIMIT 1`,
      [studentUserId, tenantId],
    );
    return (rows[0]?.faculty_user_id as string | undefined) ?? null;
  }

  private async getApplication(tenantId: string, applicationId: string) {
    const rows = await this.db.query(
      `SELECT a.*,
              u.name AS student_name,
              u.official_email AS student_email,
              c.title AS config_title,
              gf.name AS guide_name
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       LEFT JOIN users gf ON gf.user_id = a.guide_faculty_user_id
       WHERE a.application_id = $1 AND a.tenant_id = $2`,
      [applicationId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Application not found');
    return rows[0] as Record<string, unknown>;
  }

  async getActiveConfig(tenantId?: string) {
    const rows = await this.db.query(
      `SELECT * FROM academic_rnd_configs
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [this.tenant(tenantId)],
    );
    return rows[0] ?? null;
  }

  async listConfigs(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM academic_rnd_configs
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async upsertConfig(tenantId: string | undefined, dto: UpsertRndConfigDto) {
    const tid = this.tenant(tenantId);
    if (dto.is_active !== false) {
      await this.db.query(
        `UPDATE academic_rnd_configs SET is_active = false, updated_at = NOW() WHERE tenant_id = $1`,
        [tid],
      );
    }
    const rows = await this.db.query(
      `INSERT INTO academic_rnd_configs (
         tenant_id, title, deadline, attachment_rules, is_active
       ) VALUES ($1, $2, $3, $4::jsonb, COALESCE($5, true))
       RETURNING *`,
      [
        tid,
        dto.title,
        dto.deadline ?? null,
        JSON.stringify(dto.attachment_rules ?? []),
        dto.is_active ?? true,
      ],
    );
    const config = rows[0] as { title: string; deadline: string | null };
    if (dto.is_active !== false) {
      await this.notifyStudentsOfConfig(tid, config.title, config.deadline);
    }
    return rows[0];
  }

  async submitApplication(
    tenantId: string | undefined,
    studentUserId: string,
    dto: SubmitRndApplicationDto,
  ) {
    const tid = this.tenant(tenantId);
    const config = await this.getActiveConfig(tid);
    if (!config) {
      throw new BadRequestException('No active research grant call is open');
    }
    if (String(config.config_id) !== dto.config_id) {
      throw new BadRequestException('Invalid or expired grant configuration');
    }
    if (config.deadline && new Date(String(config.deadline)) < new Date()) {
      throw new BadRequestException('Application deadline has passed');
    }

    const existing = await this.db.query(
      `SELECT application_id FROM academic_rnd_applications
       WHERE tenant_id = $1 AND student_user_id = $2 AND config_id = $3
         AND status NOT IN ('GUIDE_REJECTED', 'BUDGET_REJECTED', 'GRANT_REJECTED')
       LIMIT 1`,
      [tid, studentUserId, dto.config_id],
    );
    if (existing[0]) {
      throw new BadRequestException(
        'You already have an active application for this grant call',
      );
    }

    const guideFacultyUserId = await this.resolveGuideFaculty(
      tid,
      studentUserId,
    );
    const rows = await this.db.query(
      `INSERT INTO academic_rnd_applications (
         tenant_id, config_id, student_user_id, guide_faculty_user_id,
         project_title, requested_budget, documents, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'PENDING_GUIDE')
       RETURNING *`,
      [
        tid,
        dto.config_id,
        studentUserId,
        guideFacultyUserId,
        dto.project_title,
        dto.requested_budget ?? null,
        JSON.stringify(dto.documents ?? {}),
      ],
    );

    if (guideFacultyUserId) {
      this.notify.approvalRequired({
        tenantId: tid,
        userId: guideFacultyUserId,
        title: 'R&D Grant — Guide Review',
        message: `Student application "${dto.project_title}" awaits your technical review.`,
        actionLink: '/faculty/research-approvals',
        category: 'ACADEMIC_RND',
        requestType: 'GUIDE_REVIEW',
      });
    }

    return rows[0];
  }

  async listMyApplications(
    tenantId: string | undefined,
    studentUserId: string,
  ) {
    return this.db.query(
      `SELECT a.*, c.title AS config_title,
              (
                SELECT json_agg(ap ORDER BY ap.action_date ASC)
                FROM academic_rnd_approvals ap
                WHERE ap.application_id = a.application_id
              ) AS approvals
       FROM academic_rnd_applications a
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1 AND a.student_user_id = $2
       ORDER BY a.submitted_at DESC`,
      [this.tenant(tenantId), studentUserId],
    );
  }

  async listGuideQueue(tenantId: string | undefined, facultyUserId: string) {
    return this.db.query(
      `SELECT a.*, u.name AS student_name, c.title AS config_title
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1 AND a.status = 'PENDING_GUIDE'
         AND (a.guide_faculty_user_id = $2 OR a.guide_faculty_user_id IS NULL)
       ORDER BY a.submitted_at ASC`,
      [this.tenant(tenantId), facultyUserId],
    );
  }

  async listBudgetQueue(tenantId?: string) {
    return this.db.query(
      `SELECT a.*, u.name AS student_name, c.title AS config_title
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1 AND a.status = 'PENDING_BUDGET'
       ORDER BY a.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async listRankingQueue(tenantId?: string) {
    return this.db.query(
      `SELECT a.*, u.name AS student_name, c.title AS config_title
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1 AND a.status = 'PENDING_RANKING'
       ORDER BY a.submitted_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async listAllApplications(tenantId?: string) {
    return this.db.query(
      `SELECT a.*, u.name AS student_name, c.title AS config_title
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1
       ORDER BY a.submitted_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async approveGuide(
    tenantId: string | undefined,
    approverUserId: string,
    applicationId: string,
    dto: RndApprovalActionDto,
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.getApplication(tid, applicationId);
    this.assertTransition(String(app.status), 'PENDING_BUDGET');

    const rows = await this.db.query(
      `UPDATE academic_rnd_applications
       SET status = 'PENDING_BUDGET', updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND status = 'PENDING_GUIDE'
       RETURNING *`,
      [applicationId, tid],
    );
    if (!rows[0])
      throw new BadRequestException('Application not in guide review queue');

    await this.db.query(
      `INSERT INTO academic_rnd_approvals (
         tenant_id, application_id, approver_user_id, approval_tier, status, remarks
       ) VALUES ($1, $2, $3, 'GUIDE', 'APPROVED', $4)`,
      [tid, applicationId, approverUserId, dto.remarks ?? null],
    );

    await this.notifyStudent(
      tid,
      String(app.student_user_id),
      'R&D Grant — Guide Approved',
      `Your project "${app.project_title}" passed technical review and is forwarded for budget approval.`,
    );
    return rows[0];
  }

  async rejectGuide(
    tenantId: string | undefined,
    approverUserId: string,
    applicationId: string,
    remarks: string,
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.getApplication(tid, applicationId);
    this.assertTransition(String(app.status), 'GUIDE_REJECTED');

    const rows = await this.db.query(
      `UPDATE academic_rnd_applications
       SET status = 'GUIDE_REJECTED', updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND status = 'PENDING_GUIDE'
       RETURNING *`,
      [applicationId, tid],
    );
    if (!rows[0])
      throw new BadRequestException('Application not in guide review queue');

    await this.db.query(
      `INSERT INTO academic_rnd_approvals (
         tenant_id, application_id, approver_user_id, approval_tier, status, remarks
       ) VALUES ($1, $2, $3, 'GUIDE', 'REJECTED', $4)`,
      [tid, applicationId, approverUserId, remarks],
    );

    await this.notifyStudent(
      tid,
      String(app.student_user_id),
      'R&D Grant — Guide Rejected',
      `Your project "${app.project_title}" was rejected at guide review. Remarks: ${remarks}`,
    );
    return rows[0];
  }

  async approveBudget(
    tenantId: string | undefined,
    approverUserId: string,
    applicationId: string,
    dto: RndApprovalActionDto,
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.getApplication(tid, applicationId);
    this.assertTransition(String(app.status), 'PENDING_RANKING');

    const rows = await this.db.query(
      `UPDATE academic_rnd_applications
       SET status = 'PENDING_RANKING', budget_approved = true, updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND status = 'PENDING_BUDGET'
       RETURNING *`,
      [applicationId, tid],
    );
    if (!rows[0])
      throw new BadRequestException('Application not in budget review queue');

    await this.db.query(
      `INSERT INTO academic_rnd_approvals (
         tenant_id, application_id, approver_user_id, approval_tier, status, remarks
       ) VALUES ($1, $2, $3, 'BUDGET', 'APPROVED', $4)`,
      [tid, applicationId, approverUserId, dto.remarks ?? null],
    );

    await this.notifyStudent(
      tid,
      String(app.student_user_id),
      'R&D Grant — Budget Approved',
      `Budget for "${app.project_title}" is approved. Your application proceeds to committee ranking.`,
    );
    return rows[0];
  }

  async rejectBudget(
    tenantId: string | undefined,
    approverUserId: string,
    applicationId: string,
    remarks: string,
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.getApplication(tid, applicationId);
    this.assertTransition(String(app.status), 'BUDGET_REJECTED');

    const rows = await this.db.query(
      `UPDATE academic_rnd_applications
       SET status = 'BUDGET_REJECTED', budget_approved = false, updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND status = 'PENDING_BUDGET'
       RETURNING *`,
      [applicationId, tid],
    );
    if (!rows[0])
      throw new BadRequestException('Application not in budget review queue');

    await this.db.query(
      `INSERT INTO academic_rnd_approvals (
         tenant_id, application_id, approver_user_id, approval_tier, status, remarks
       ) VALUES ($1, $2, $3, 'BUDGET', 'REJECTED', $4)`,
      [tid, applicationId, approverUserId, remarks],
    );

    await this.notifyStudent(
      tid,
      String(app.student_user_id),
      'R&D Grant — Budget Rejected',
      `Budget request for "${app.project_title}" was rejected. Remarks: ${remarks}`,
    );
    return rows[0];
  }

  async submitRanking(
    tenantId: string | undefined,
    approverUserId: string,
    applicationId: string,
    dto: RndRankingDto,
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.getApplication(tid, applicationId);
    const finalStatus =
      dto.ranking_status === 'APPROVED' ? 'GRANT_APPROVED' : 'GRANT_REJECTED';
    this.assertTransition(String(app.status), finalStatus);

    const rows = await this.db.query(
      `UPDATE academic_rnd_applications
       SET status = $3,
           ranking_score = $4,
           ranking_status = $5,
           updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND status = 'PENDING_RANKING'
       RETURNING *`,
      [applicationId, tid, finalStatus, dto.ranking_score, dto.ranking_status],
    );
    if (!rows[0])
      throw new BadRequestException('Application not in ranking queue');

    await this.db.query(
      `INSERT INTO academic_rnd_approvals (
         tenant_id, application_id, approver_user_id, approval_tier, status, remarks, ranking_score
       ) VALUES ($1, $2, $3, 'RANKING', $4, $5, $6)`,
      [
        tid,
        applicationId,
        approverUserId,
        dto.ranking_status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        dto.remarks ?? null,
        dto.ranking_score,
      ],
    );

    const approved = dto.ranking_status === 'APPROVED';
    await this.notifyStudent(
      tid,
      String(app.student_user_id),
      approved
        ? 'R&D Grant — Approved for Funding'
        : 'R&D Grant — Not Selected',
      approved
        ? `Congratulations! "${app.project_title}" scored ${dto.ranking_score}/100 and is approved for the research grant.`
        : `"${app.project_title}" received a ranking score of ${dto.ranking_score}/100 and was not selected for funding.`,
    );
    return rows[0];
  }

  async exportNaacReport(tenantId?: string): Promise<Buffer> {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT a.project_title, u.name AS student_name, u.official_email,
              a.requested_budget, a.budget_approved, a.ranking_score, a.ranking_status,
              a.status, c.title AS grant_call, a.submitted_at
       FROM academic_rnd_applications a
       JOIN users u ON u.user_id = a.student_user_id
       LEFT JOIN academic_rnd_configs c ON c.config_id = a.config_id
       WHERE a.tenant_id = $1
       ORDER BY a.submitted_at DESC`,
      [tid],
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Student R&D Grants');
    sheet.columns = [
      { header: 'Grant Call', key: 'grant_call', width: 28 },
      { header: 'Student', key: 'student_name', width: 22 },
      { header: 'Email', key: 'official_email', width: 28 },
      { header: 'Project Title', key: 'project_title', width: 32 },
      { header: 'Budget Requested', key: 'requested_budget', width: 16 },
      { header: 'Budget Approved', key: 'budget_approved', width: 14 },
      { header: 'Ranking Score', key: 'ranking_score', width: 14 },
      { header: 'Ranking Status', key: 'ranking_status', width: 14 },
      { header: 'Workflow Status', key: 'status', width: 18 },
      { header: 'Submitted At', key: 'submitted_at', width: 20 },
    ];
    for (const row of rows as Record<string, unknown>[]) {
      sheet.addRow({
        ...row,
        budget_approved: row.budget_approved ? 'Yes' : 'No',
        submitted_at: row.submitted_at
          ? new Date(String(row.submitted_at)).toLocaleString('en-IN')
          : '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

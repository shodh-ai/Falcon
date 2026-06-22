import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import {
  PHD_ACTIONS,
  PHD_APPLICATION_TYPES,
  type PhdAction,
  type PhdApplicationType,
} from './phd-lifecycle.constants';

interface CreateApplicationDto {
  application_type?: string;
  proposed_topic?: string;
  applicant_name?: string;
  applicant_email?: string;
  document_urls?: string[];
}

interface PerformActionDto {
  action?: string;
  remarks?: string;
  guide_user_id?: string;
  semester?: number;
  document_urls?: string[];
  notes?: string;
}

@Injectable()
export class PhdLifecycleService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async createApplication(tenantId: string, userId: string, dto: CreateApplicationDto) {
    const appType = (dto.application_type ?? 'PET').toUpperCase() as PhdApplicationType;
    if (!PHD_APPLICATION_TYPES.includes(appType)) {
      throw new BadRequestException('application_type must be PET or PET_EXEMPTION');
    }
    if (!dto.proposed_topic?.trim()) {
      throw new BadRequestException('Proposed research topic is required.');
    }

    const open = await this.db.query(
      `SELECT 1 FROM phd_candidates
       WHERE tenant_id = $1 AND user_id = $2
         AND lifecycle_stage NOT IN ('CLOSED', 'AWARD')
         AND lifecycle_status NOT IN ('DEGREE_AWARDED', 'APPLICATION_SCRUTINY_REJECTED', 'PET_FAILED', 'DRC_REJECTED', 'REGISTRATION_CANCELLED')
       LIMIT 1`,
      [tenantId, userId],
    );
    if (open.length > 0) {
      throw new BadRequestException('You already have an active Ph.D. application or candidature.');
    }

    const [user] = await this.db.query(
      `SELECT name, official_email, dept_id FROM users WHERE user_id = $1`,
      [userId],
    );

    const rows = await this.db.query(
      `INSERT INTO phd_candidates (
         tenant_id, user_id, applicant_name, applicant_email, application_type,
         proposed_topic, dept_id, lifecycle_stage, lifecycle_status, pending_actor_role
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ADMISSION','APPLICATION_SUBMITTED','DRC_MEMBER')
       RETURNING *`,
      [
        tenantId,
        userId,
        dto.applicant_name?.trim() ?? user?.name ?? null,
        dto.applicant_email?.trim() ?? user?.official_email ?? null,
        appType,
        dto.proposed_topic.trim(),
        user?.dept_id ?? null,
      ],
    );

    await this.notifyRoles(tenantId, ['DRC_MEMBER'], {
      title: 'New Ph.D. application',
      message: `${user?.name ?? 'An applicant'} submitted a Ph.D. ${appType === 'PET_EXEMPTION' ? 'PET exemption' : 'PET'} application.`,
      actionLink: '/research/drc/applications',
      requestType: 'PHD_APPLICATION',
    });

    return rows[0];
  }

  listMyApplications(tenantId: string, userId: string) {
    return this.listCandidatesWhere(tenantId, 'c.user_id = $2', [tenantId, userId]);
  }

  listForRole(tenantId: string, role: string, actorUserId?: string) {
    const normalized = this.normalizeRole(role);
    if (normalized === 'Faculty' && actorUserId) {
      return this.listGuideScholars(tenantId, actorUserId);
    }
    if (normalized === 'DRC_MEMBER') {
      return this.listCandidatesWhere(
        tenantId,
        `(c.pending_actor_role = 'DRC_MEMBER' OR c.lifecycle_status = ANY($2::text[]))`,
        [tenantId, this.statusesForCommittee('DRC_MEMBER')],
      );
    }
    if (normalized === 'RAC_MEMBER') {
      return this.listCandidatesWhere(
        tenantId,
        `(c.pending_actor_role = 'RAC_MEMBER' OR c.lifecycle_status = ANY($2::text[]))`,
        [tenantId, this.statusesForCommittee('RAC_MEMBER')],
      );
    }
    if (normalized === 'RRC_MEMBER') {
      return this.listCandidatesWhere(
        tenantId,
        `(c.pending_actor_role = 'RRC_MEMBER' OR c.lifecycle_status = ANY($2::text[]))`,
        [tenantId, this.statusesForCommittee('RRC_MEMBER')],
      );
    }
    if (normalized === 'PHD_ADJUDICATOR') {
      return this.listCandidatesWhere(
        tenantId,
        `(c.pending_actor_role = 'PHD_ADJUDICATOR' OR c.lifecycle_status = ANY($2::text[]))`,
        [tenantId, this.statusesForCommittee('PHD_ADJUDICATOR')],
      );
    }
    if (normalized === 'Registrar') {
      return this.listCandidatesWhere(
        tenantId,
        `c.pending_actor_role IN ('Registrar', 'Accountant') OR c.lifecycle_status IN ('SUPERVISOR_ALLOCATED', 'FEES_PAID', 'FINAL_THESIS_SUBMITTED')`,
        [tenantId],
      );
    }
    if (normalized === 'Accountant') {
      return this.listCandidatesWhere(tenantId, `c.pending_actor_role = 'Accountant'`, [tenantId]);
    }
    if (['Dean', 'Leadership', 'President'].includes(normalized)) {
      return this.listCandidatesWhere(tenantId, `c.lifecycle_status = 'VIVA_RECOMMENDED'`, [tenantId]);
    }
    return this.listCandidatesWhere(tenantId, 'TRUE', [tenantId]);
  }

  listGuideScholars(tenantId: string, guideUserId: string) {
    return this.listCandidatesWhere(
      tenantId,
      `c.guide_user_id = $2 AND c.lifecycle_stage NOT IN ('ADMISSION', 'CLOSED')`,
      [tenantId, guideUserId],
    );
  }

  async getCandidate(tenantId: string, candidateId: string) {
    const rows = await this.listCandidatesWhere(tenantId, 'c.candidate_id = $2', [tenantId, candidateId]);
    if (!rows.length) throw new NotFoundException('Ph.D. candidate not found');
    const submissions = await this.db.query(
      `SELECT * FROM phd_submissions WHERE candidate_id = $1 ORDER BY created_at DESC`,
      [candidateId],
    );
    const decisions = await this.db.query(
      `SELECT d.*, u.name AS decided_by_name
       FROM phd_committee_decisions d
       LEFT JOIN users u ON u.user_id = d.decided_by
       WHERE d.candidate_id = $1 ORDER BY d.created_at DESC`,
      [candidateId],
    );
    return { ...rows[0], submissions, decisions, available_actions: [] };
  }

  async performAction(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    candidateId: string,
    dto: PerformActionDto,
  ) {
    const action = (dto.action ?? '').toUpperCase() as PhdAction;
    const def = PHD_ACTIONS[action];
    if (!def) throw new BadRequestException('Invalid action.');

    const role = this.normalizeRole(actorRole);
    if (!def.actorRoles.includes(role)) {
      throw new ForbiddenException('You are not allowed to perform this action.');
    }

    const [candidate] = await this.db.query(
      `SELECT * FROM phd_candidates WHERE candidate_id = $1 AND tenant_id = $2`,
      [candidateId, tenantId],
    );
    if (!candidate) throw new NotFoundException('Ph.D. candidate not found');
    if (!def.from.includes(candidate.lifecycle_status)) {
      throw new BadRequestException(
        `Action ${action} is not valid for current status ${candidate.lifecycle_status}.`,
      );
    }

    if (role === 'Faculty' && candidate.guide_user_id !== actorUserId) {
      throw new ForbiddenException('You are not the allocated guide for this candidate.');
    }
    if (role === 'Student' && candidate.user_id !== actorUserId) {
      throw new ForbiddenException('This is not your Ph.D. record.');
    }

    if (action === 'ALLOCATE_SUPERVISOR' || action === 'ALLOCATE_GUIDE') {
      if (!dto.guide_user_id) {
        throw new BadRequestException('guide_user_id is required to allocate a supervisor/guide.');
      }
      await this.validateGuide(tenantId, dto.guide_user_id);
    }

    const submissionType = this.submissionTypeForAction(action);
    if (submissionType) {
      await this.db.query(
        `INSERT INTO phd_submissions (
           candidate_id, tenant_id, submission_type, semester, document_urls, notes, status, reviewer_user_id, reviewed_at
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'PENDING',$7,NOW())`,
        [
          candidateId,
          tenantId,
          submissionType,
          dto.semester ?? candidate.semester_count + 1,
          JSON.stringify(dto.document_urls ?? []),
          dto.notes?.trim() ?? dto.remarks?.trim() ?? null,
          ['RAC_PROGRESS_SATISFACTORY', 'VERIFY_ELIGIBILITY', 'APPROVE_COURSEWORK', 'VERIFY_GUIDE_ACCEPTANCE'].includes(action)
            ? actorUserId
            : null,
        ],
      );
      if (action === 'SUBMIT_PROGRESS_REPORT') {
        await this.db.query(
          `UPDATE phd_candidates SET semester_count = semester_count + 1, updated_at = NOW() WHERE candidate_id = $1`,
          [candidateId],
        );
      }
    }

    if (def.committee && def.decision) {
      await this.db.query(
        `INSERT INTO phd_committee_decisions (candidate_id, tenant_id, committee_type, decision, remarks, decided_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [candidateId, tenantId, def.committee, def.decision, dto.remarks?.trim() ?? null, actorUserId],
      );
    }

    const extra: Record<string, unknown> = {};
    if (dto.guide_user_id) extra.guide_user_id = dto.guide_user_id;
    if (action === 'VERIFY_DOCUMENTS') extra.documents_verified = true;
    if (action === 'RECORD_FEES') extra.fee_paid = true;
    if (action === 'ISSUE_ADMISSION') extra.admission_certificate_issued = true;
    if (action === 'ALLOCATE_GUIDE') extra.guide_certificate_issued = true;
    if (action === 'RAC_CANCEL_REGISTRATION') extra.registration_cancelled = true;
    if (action === 'VIVA_REQUIRE_RE_VIVA') extra.re_viva_due_at = new Date(Date.now() + 180 * 86400000);

    await this.applyStatus(tenantId, candidateId, def.to, def.stage, def.pendingRole, extra);

    if (def.notifyRoles?.length) {
      await this.notifyRoles(tenantId, def.notifyRoles, {
        title: 'Ph.D. workflow update',
        message: `A Ph.D. candidate moved to ${def.to.replace(/_/g, ' ').toLowerCase()}.`,
        actionLink: this.actionLinkForRole(def.pendingRole ?? def.notifyRoles[0]),
        requestType: 'PHD_LIFECYCLE',
      });
    }
    if (def.notifyGuide && dto.guide_user_id) {
      this.notify.approvalRequired({
        tenantId,
        userId: dto.guide_user_id,
        title: 'Ph.D. guide allocation',
        message: 'You have been allocated as research guide for a Ph.D. candidate.',
        actionLink: '/faculty/phd/scholars',
        requestType: 'PHD_LIFECYCLE',
      });
    }
    if (def.notifyCandidate !== false && candidate.user_id) {
      this.notify.approvalRequired({
        tenantId,
        userId: candidate.user_id,
        title: 'Ph.D. status update',
        message: `Your Ph.D. application status is now: ${def.to.replace(/_/g, ' ').toLowerCase()}.`,
        actionLink: '/student/phd',
        requestType: 'PHD_LIFECYCLE',
      });
    }

    return { status: def.to, stage: def.stage };
  }

  listGuideOptions(tenantId: string) {
    return this.db.query(
      `SELECT u.user_id, u.name, u.official_email, d.dept_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = 'Faculty'
       ORDER BY u.name LIMIT 200`,
      [tenantId],
    );
  }

  private async applyStatus(
    tenantId: string,
    candidateId: string,
    status: string,
    stage: string,
    pendingRole: string | null,
    extra: Record<string, unknown> = {},
  ) {
    const sets = [
      'lifecycle_status = $3',
      'lifecycle_stage = $4',
      'pending_actor_role = $5',
      'updated_at = NOW()',
    ];
    const params: unknown[] = [candidateId, tenantId, status, stage, pendingRole];
    let idx = 6;
    for (const [key, value] of Object.entries(extra)) {
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    await this.db.query(
      `UPDATE phd_candidates SET ${sets.join(', ')} WHERE candidate_id = $1 AND tenant_id = $2`,
      params,
    );
  }

  private listCandidatesWhere(tenantId: string, where: string, params: unknown[]) {
    return this.db.query(
      `SELECT c.*,
              u.name AS candidate_name,
              u.official_email AS candidate_email,
              g.name AS guide_name,
              d.dept_name
       FROM phd_candidates c
       LEFT JOIN users u ON u.user_id = c.user_id
       LEFT JOIN users g ON g.user_id = c.guide_user_id
       LEFT JOIN departments d ON d.dept_id = c.dept_id
       WHERE c.tenant_id = $1 AND ${where}
       ORDER BY c.updated_at DESC`,
      params,
    );
  }

  private statusesForCommittee(role: string): string[] {
    switch (role) {
      case 'DRC_MEMBER':
        return [
          'APPLICATION_SUBMITTED',
          'APPLICATION_SCRUTINY_RECOMMENDED',
          'PET_PENDING',
          'PET_EXEMPTED',
          'PET_QUALIFIED',
          'DRC_SHORTLISTED',
        ];
      case 'RAC_MEMBER':
        return [
          'ADMITTED',
          'ELIGIBILITY_SUBMITTED',
          'COURSEWORK_SUBMITTED',
          'PROGRESS_REPORT_DUE',
          'PROGRESS_SATISFACTORY',
          'PROGRESS_UNSATISFACTORY',
        ];
      case 'RRC_MEMBER':
        return [
          'SYNOPSIS_SUBMITTED',
          'THESIS_FORMAT_SUBMITTED',
          'THESIS_RECOMMENDED',
          'VIVA_VOCE_SCHEDULED',
          'RE_VIVA_REQUIRED',
        ];
      case 'PHD_ADJUDICATOR':
        return ['SYNOPSIS_ADJUDICATION_PENDING', 'THESIS_EVALUATION_PENDING'];
      default:
        return [];
    }
  }

  private submissionTypeForAction(action: PhdAction): string | null {
    const map: Partial<Record<PhdAction, string>> = {
      SUBMIT_GUIDE_ACCEPTANCE: 'GUIDE_ACCEPTANCE',
      SUBMIT_ELIGIBILITY: 'ELIGIBILITY',
      SUBMIT_COURSEWORK: 'COURSEWORK',
      SUBMIT_PROGRESS_REPORT: 'PROGRESS_REPORT',
      SUBMIT_SYNOPSIS: 'SYNOPSIS',
      SUBMIT_THESIS_FORMAT: 'THESIS_DRAFT',
      SUBMIT_THESIS: 'THESIS_DRAFT',
      SUBMIT_FINAL_THESIS: 'THESIS_FINAL',
    };
    return map[action] ?? null;
  }

  private async validateGuide(tenantId: string, guideUserId: string) {
    const [row] = await this.db.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND r.role_name = 'Faculty' AND u.is_active = true`,
      [guideUserId, tenantId],
    );
    if (!row) throw new BadRequestException('Selected guide is not a valid faculty member.');
  }

  private normalizeRole(role: string): string {
    if (role === 'HoD') return 'HOD';
    return role;
  }

  private actionLinkForRole(role: string): string {
    switch (role) {
      case 'DRC_MEMBER':
        return '/research/drc/applications';
      case 'RAC_MEMBER':
        return '/research/rac/reviews';
      case 'RRC_MEMBER':
        return '/research/rrc/reviews';
      case 'PHD_ADJUDICATOR':
        return '/research/adjudicator/reviews';
      case 'Faculty':
        return '/faculty/phd/scholars';
      case 'Registrar':
        return '/admin/phd/admissions';
      case 'Dean':
        return '/dean/phd/approvals';
      default:
        return '/student/phd';
    }
  }

  private async notifyRoles(
    tenantId: string,
    roleNames: string[],
    payload: { title: string; message: string; actionLink: string; requestType?: string },
  ) {
    const recipients = await this.db.query(
      `SELECT DISTINCT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = ANY($2::text[])`,
      [tenantId, roleNames],
    );
    for (const row of recipients as Array<{ user_id: string }>) {
      this.notify.approvalRequired({ tenantId, userId: row.user_id, ...payload });
    }
  }
}

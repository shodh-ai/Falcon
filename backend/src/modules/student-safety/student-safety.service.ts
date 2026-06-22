import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const CONCERN_TYPES = ['RAGGING', 'SEXUAL_HARASSMENT'] as const;
const ACCUSED_TYPES = ['FACULTY', 'STUDENT', 'SENIOR', 'STAFF', 'OTHER'] as const;
const ACTIVE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] as const;

type ConcernType = (typeof CONCERN_TYPES)[number];
type AccusedType = (typeof ACCUSED_TYPES)[number];
type ConcernStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

interface CreateConcernDto {
  concern_type?: string;
  accused_type?: string;
  accused_user_id?: string | null;
  accused_description?: string;
  incident_description?: string;
  incident_location?: string;
  incident_date?: string;
  is_hostel_related?: boolean;
  evidence_urls?: string[];
}

interface DecisionDto {
  status?: ConcernStatus;
  remarks?: string;
  resolution_summary?: string;
}

@Injectable()
export class StudentSafetyService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async createConcern(tenantId: string, reporterUserId: string, dto: CreateConcernDto) {
    const concernType = (dto.concern_type ?? '').toUpperCase() as ConcernType;
    const accusedType = (dto.accused_type ?? '').toUpperCase() as AccusedType;

    if (!CONCERN_TYPES.includes(concernType)) {
      throw new BadRequestException(`concern_type must be one of: ${CONCERN_TYPES.join(', ')}`);
    }
    if (!ACCUSED_TYPES.includes(accusedType)) {
      throw new BadRequestException(`accused_type must be one of: ${ACCUSED_TYPES.join(', ')}`);
    }
    if (!dto.incident_description?.trim()) {
      throw new BadRequestException('Please describe what happened.');
    }
    if (!dto.accused_user_id && !dto.accused_description?.trim()) {
      throw new BadRequestException(
        'Identify the person involved or provide a description if you do not know their account.',
      );
    }

    const open = await this.db.query(
      `SELECT 1 FROM student_safety_concerns
       WHERE tenant_id = $1 AND reporter_user_id = $2
         AND status = ANY($3::text[])
       LIMIT 1`,
      [tenantId, reporterUserId, ACTIVE_STATUSES],
    );
    if (open.length > 0) {
      throw new BadRequestException('You already have an active safety concern under review.');
    }

    if (dto.accused_user_id) {
      await this.validateAccusedUser(tenantId, accusedType, dto.accused_user_id);
    }

    const routedRoles = this.resolveRouting(concernType, accusedType, !!dto.is_hostel_related);
    const evidenceUrls = Array.isArray(dto.evidence_urls)
      ? dto.evidence_urls.filter((u) => typeof u === 'string' && u.trim())
      : [];

    const rows = await this.db.query(
      `INSERT INTO student_safety_concerns (
         tenant_id, reporter_user_id, concern_type, accused_type, accused_user_id,
         accused_description, incident_description, incident_location, incident_date,
         is_hostel_related, evidence_urls, routed_to_roles, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'SUBMITTED')
       RETURNING *`,
      [
        tenantId,
        reporterUserId,
        concernType,
        accusedType,
        dto.accused_user_id ?? null,
        dto.accused_description?.trim() ?? null,
        dto.incident_description.trim(),
        dto.incident_location?.trim() ?? null,
        dto.incident_date ?? null,
        !!dto.is_hostel_related,
        JSON.stringify(evidenceUrls),
        routedRoles,
      ],
    );
    const concern = rows[0];

    const [reporter] = await this.db.query(`SELECT name FROM users WHERE user_id = $1`, [
      reporterUserId,
    ]);

    await this.notifyRoles(tenantId, routedRoles, {
      title: concernType === 'SEXUAL_HARASSMENT' ? 'Sexual harassment concern' : 'Ragging concern',
      message: `A new ${concernType === 'SEXUAL_HARASSMENT' ? 'sexual harassment' : 'ragging'} concern was submitted and requires review.`,
      actionLink: this.actionLinkForRole(routedRoles[0]),
      requesterName: reporter?.name,
      requestType: 'STUDENT_SAFETY_CONCERN',
    });

    if (accusedType === 'FACULTY' && dto.accused_user_id) {
      await this.notifyAccusedFaculty(tenantId, dto.accused_user_id, concernType);
      await this.db.query(
        `UPDATE student_safety_concerns SET accused_notified_at = NOW(), updated_at = NOW()
         WHERE concern_id = $1`,
        [concern.concern_id],
      );
    }

    return concern;
  }

  listMyConcerns(tenantId: string, reporterUserId: string) {
    return this.db.query(
      `SELECT c.*,
              accused.name AS accused_name,
              accused.official_email AS accused_email
       FROM student_safety_concerns c
       LEFT JOIN users accused ON accused.user_id = c.accused_user_id
       WHERE c.tenant_id = $1 AND c.reporter_user_id = $2
       ORDER BY c.created_at DESC`,
      [tenantId, reporterUserId],
    );
  }

  listAccusedOptions(tenantId: string, accusedType: string) {
    const normalized = (accusedType ?? '').toUpperCase() as AccusedType;
    if (!ACCUSED_TYPES.includes(normalized)) {
      throw new BadRequestException(`type must be one of: ${ACCUSED_TYPES.join(', ')}`);
    }
    const roleMap: Record<AccusedType, string[]> = {
      FACULTY: ['Faculty'],
      STUDENT: ['Student'],
      SENIOR: ['Student'],
      STAFF: ['HR', 'Warden', 'Faculty', 'HOD', 'Dean'],
      OTHER: [],
    };
    const roles = roleMap[normalized];
    if (!roles.length) return [];

    return this.db.query(
      `SELECT u.user_id, u.name, u.official_email, r.role_name, d.dept_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = ANY($2::text[])
       ORDER BY u.name
       LIMIT 200`,
      [tenantId, roles],
    );
  }

  listForRole(tenantId: string, roleName: string, reviewerUserId: string) {
    const normalized = this.normalizeRole(roleName);
    if (normalized === 'HOD') {
      return this.listForHod(tenantId, reviewerUserId);
    }

    return this.db.query(
      `SELECT c.*,
              reporter.name AS reporter_name,
              accused.name AS accused_name,
              accused.official_email AS accused_email,
              d.dept_name AS reporter_dept_name
       FROM student_safety_concerns c
       JOIN users reporter ON reporter.user_id = c.reporter_user_id
       LEFT JOIN users accused ON accused.user_id = c.accused_user_id
       LEFT JOIN departments d ON d.dept_id = reporter.dept_id
       WHERE c.tenant_id = $1 AND $2 = ANY(c.routed_to_roles)
       ORDER BY (c.status = 'SUBMITTED') DESC, (c.status = 'UNDER_REVIEW') DESC, c.created_at DESC`,
      [tenantId, normalized],
    );
  }

  listFacultyNotices(tenantId: string, facultyUserId: string) {
    return this.db.query(
      `SELECT concern_id, concern_type, status, accused_notified_at, created_at, updated_at
       FROM student_safety_concerns
       WHERE tenant_id = $1 AND accused_user_id = $2 AND accused_type = 'FACULTY'
       ORDER BY created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async updateConcern(
    tenantId: string,
    reviewerUserId: string,
    reviewerRole: string,
    concernId: string,
    dto: DecisionDto,
  ) {
    const concern = await this.loadConcern(tenantId, concernId);
    const role = this.normalizeRole(reviewerRole);

    if (!concern.routed_to_roles?.includes(role)) {
      throw new ForbiddenException('This concern is not in your review scope.');
    }

    const nextStatus = dto.status ?? 'UNDER_REVIEW';
    if (!['UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED'].includes(nextStatus)) {
      throw new BadRequestException('Invalid status.');
    }

    const resolvedAt = ['RESOLVED', 'CLOSED'].includes(nextStatus) ? new Date() : null;

    await this.db.query(
      `UPDATE student_safety_concerns
       SET status = $2,
           reviewer_user_id = $3,
           reviewer_remarks = COALESCE($4, reviewer_remarks),
           resolution_summary = COALESCE($5, resolution_summary),
           resolved_at = COALESCE($6, resolved_at),
           updated_at = NOW()
       WHERE concern_id = $1`,
      [
        concernId,
        nextStatus,
        reviewerUserId,
        dto.remarks?.trim() ?? null,
        dto.resolution_summary?.trim() ?? null,
        resolvedAt,
      ],
    );

    if (nextStatus === 'ESCALATED') {
      await this.db.query(
        `UPDATE student_safety_concerns
         SET routed_to_roles = (
           SELECT ARRAY(SELECT DISTINCT unnest(routed_to_roles || ARRAY['Dean']::text[]))
         ), updated_at = NOW()
         WHERE concern_id = $1`,
        [concernId],
      );
      await this.notifyRoles(tenantId, ['Dean'], {
        title: 'Safety concern escalated',
        message: 'A student safety concern has been escalated for your review.',
        actionLink: '/dean/safety-concerns',
        requestType: 'STUDENT_SAFETY_CONCERN',
      });
    }

    this.notify.approvalRequired({
      tenantId,
      userId: concern.reporter_user_id,
      title:
        nextStatus === 'RESOLVED' || nextStatus === 'CLOSED'
          ? 'Safety concern update'
          : 'Safety concern under review',
      message:
        nextStatus === 'RESOLVED' || nextStatus === 'CLOSED'
          ? `Your ${this.concernLabel(concern.concern_type)} concern has been ${nextStatus.toLowerCase()}.${dto.resolution_summary ? ` ${dto.resolution_summary}` : ''}`
          : `Your ${this.concernLabel(concern.concern_type)} concern is now ${nextStatus.replace('_', ' ').toLowerCase()}.`,
      actionLink: '/student/safety-concerns',
      requestType: 'STUDENT_SAFETY_CONCERN',
    });

    return { status: nextStatus };
  }

  private async listForHod(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (deptIds.length === 0) return [];

    return this.db.query(
      `SELECT c.*,
              reporter.name AS reporter_name,
              accused.name AS accused_name,
              accused.official_email AS accused_email,
              d.dept_name AS reporter_dept_name
       FROM student_safety_concerns c
       JOIN users reporter ON reporter.user_id = c.reporter_user_id
       LEFT JOIN users accused ON accused.user_id = c.accused_user_id
       LEFT JOIN departments d ON d.dept_id = reporter.dept_id
       WHERE c.tenant_id = $1
         AND 'HOD' = ANY(c.routed_to_roles)
         AND reporter.dept_id = ANY($2::int[])
       ORDER BY (c.status = 'SUBMITTED') DESC, c.created_at DESC`,
      [tenantId, deptIds],
    );
  }

  private resolveRouting(
    concernType: ConcernType,
    accusedType: AccusedType,
    isHostelRelated: boolean,
  ): string[] {
    const roles = new Set<string>(['DC_MEMBER']);

    if (concernType === 'SEXUAL_HARASSMENT') {
      roles.add('HR');
      roles.add('Dean');
    }

    if (accusedType === 'FACULTY') {
      roles.add('HOD');
    } else if (accusedType === 'STUDENT' || accusedType === 'SENIOR') {
      roles.add('HOD');
      if (isHostelRelated || concernType === 'RAGGING') roles.add('Warden');
    } else if (accusedType === 'STAFF') {
      roles.add('HR');
    } else {
      roles.add('Dean');
    }

    if (concernType === 'RAGGING' && isHostelRelated) {
      roles.add('Warden');
    }

    return [...roles];
  }

  private async notifyAccusedFaculty(
    tenantId: string,
    facultyUserId: string,
    concernType: ConcernType,
  ) {
    this.notify.approvalRequired({
      tenantId,
      userId: facultyUserId,
      title: 'Official notice: safety concern logged',
      message:
        concernType === 'SEXUAL_HARASSMENT'
          ? 'A sexual harassment concern involving you has been registered and is under confidential review. Do not contact any student about this matter. Await official communication from the committee.'
          : 'A student safety concern involving you has been registered and is under review. Do not contact any student about this matter. Await official communication from the Disciplinary Committee.',
      actionLink: '/faculty/safety-notices',
      requestType: 'SAFETY_CONCERN_ACCUSED',
    });
  }

  private async notifyRoles(
    tenantId: string,
    roleNames: string[],
    payload: {
      title: string;
      message: string;
      actionLink: string;
      requesterName?: string;
      requestType?: string;
    },
  ) {
    const recipients = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = ANY($2::text[])`,
      [tenantId, roleNames],
    );
    for (const row of recipients as Array<{ user_id: string }>) {
      this.notify.approvalRequired({ tenantId, userId: row.user_id, ...payload });
    }
  }

  private actionLinkForRole(role: string): string {
    switch (role) {
      case 'HOD':
        return '/hod/safety-concerns';
      case 'Dean':
        return '/dean/safety-concerns';
      case 'HR':
        return '/hr/safety-concerns';
      case 'Warden':
        return '/hostel-admin/safety-concerns';
      default:
        return '/disciplinary-committee/safety-concerns';
    }
  }

  private async validateAccusedUser(
    tenantId: string,
    accusedType: AccusedType,
    accusedUserId: string,
  ) {
    const [user] = await this.db.query(
      `SELECT u.user_id, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true`,
      [accusedUserId, tenantId],
    );
    if (!user) throw new BadRequestException('Selected person was not found.');

    const facultyRoles = ['Faculty', 'HOD', 'Dean'];
    if (accusedType === 'FACULTY' && !facultyRoles.includes(user.role_name)) {
      throw new BadRequestException('Selected user is not faculty.');
    }
    if ((accusedType === 'STUDENT' || accusedType === 'SENIOR') && user.role_name !== 'Student') {
      throw new BadRequestException('Selected user is not a student.');
    }
  }

  private async loadConcern(tenantId: string, concernId: string) {
    const [concern] = await this.db.query(
      `SELECT * FROM student_safety_concerns WHERE concern_id = $1 AND tenant_id = $2`,
      [concernId, tenantId],
    );
    if (!concern) throw new NotFoundException('Concern not found');
    return concern;
  }

  private normalizeRole(role: string): string {
    const r = role.trim();
    if (r.toLowerCase() === 'dc_member' || r.toLowerCase() === 'dc member') return 'DC_MEMBER';
    if (r.toLowerCase() === 'hradmin') return 'HR';
    return r;
  }

  private concernLabel(type: string): string {
    return type === 'SEXUAL_HARASSMENT' ? 'sexual harassment' : 'ragging';
  }

  private async resolveHodDepartmentIds(hodUserId: string): Promise<number[]> {
    const direct = await this.db.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const [hod] = await this.db.query(`SELECT dept_id FROM users WHERE user_id = $1`, [hodUserId]);
    return Array.from(
      new Set<number>([
        ...direct.map((row: { dept_id: number }) => Number(row.dept_id)),
        ...(hod?.dept_id ? [Number(hod.dept_id)] : []),
      ]),
    );
  }
}

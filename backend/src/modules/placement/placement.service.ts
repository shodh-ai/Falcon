import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import {
  PLACEMENT_KANBAN_COLUMNS,
  PLACEMENT_TIER1_LPA_THRESHOLD,
  type PlacementPipelineStage,
} from './placement.constants';
import {
  DEFAULT_PAGE_LIMIT,
  type PaginatedResponse,
  parsePageParams,
} from '../../common/utils/pagination';
import {
  resolvePlacementSchema,
  driveRoleExpr,
  drivePackageExpr,
  driveBacklogExpr,
  driveDeadlineExpr,
  type PlacementSchema,
} from './placement-schema';

type StudentAcademics = { cgpa: number; backlogs: number };

@Injectable()
export class PlacementService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private async schema(): Promise<PlacementSchema> {
    return resolvePlacementSchema(this.db);
  }

  private driveSelect(s: PlacementSchema) {
    const join = s.companyJoin
      ? 'JOIN placement_companies c ON c.company_id = d.company_id'
      : '';
    const companyName = s.companyJoin ? 'c.company_name' : 'd.company_name';
    const roleExpr = driveRoleExpr(s);
    const pkgExpr = drivePackageExpr(s);
    const backlogExpr = driveBacklogExpr(s);
    const deadlineExpr = driveDeadlineExpr(s);

    return {
      join,
      companyName,
      roleExpr,
      pkgExpr,
      backlogExpr,
      deadlineExpr,
      select: `d.*,
               d.${s.driveIdCol} AS drive_id,
               ${roleExpr} AS job_role,
               ${roleExpr} AS job_profile,
               ${pkgExpr} AS package_lpa,
               ${backlogExpr} AS max_active_backlogs,
               ${deadlineExpr} AS deadline,
               ${companyName} AS company_name`,
      from: `${s.drivesTable} d ${join}`,
      idCol: s.driveIdCol,
    };
  }

  private activeFilter() {
    return `d.status IN ('ACTIVE', 'OPEN')`;
  }

  private numField(value: unknown, fallback: number) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private async getStudentAcademics(
    studentUserId: string,
  ): Promise<StudentAcademics> {
    const rows = await this.db.query(
      `SELECT
         COALESCE(
           SUM(e.grade_points * c.credits) FILTER (WHERE e.status = 'COMPLETED' AND e.grade_points IS NOT NULL)
           / NULLIF(SUM(c.credits) FILTER (WHERE e.status = 'COMPLETED' AND e.grade_points IS NOT NULL), 0),
           0
         ) AS cgpa,
         COUNT(*) FILTER (
           WHERE e.grade_points = 0 OR UPPER(COALESCE(e.grade, '')) IN ('F', 'FA', 'FAIL')
         )::int AS backlogs
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1`,
      [studentUserId],
    );
    const row = rows[0] as { cgpa: string; backlogs: number };
    return {
      cgpa: Number(Number(row.cgpa).toFixed(2)),
      backlogs: Number(row.backlogs),
    };
  }

  private async getPlacementLock(studentUserId: string) {
    const rows = await this.db.query(
      `SELECT is_placement_locked, placement_offer_lpa, placement_lock_reason
       FROM student_profiles WHERE user_id = $1`,
      [studentUserId],
    );
    const row = rows[0] as
      | {
          is_placement_locked?: boolean;
          placement_offer_lpa?: string;
          placement_lock_reason?: string;
        }
      | undefined;
    return {
      locked: Boolean(row?.is_placement_locked),
      offerLpa: row?.placement_offer_lpa
        ? Number(row.placement_offer_lpa)
        : null,
      reason: row?.placement_lock_reason ?? null,
    };
  }

  companies(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM placement_companies WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  createCompany(tenantId: string, dto: Record<string, unknown>) {
    return this.db.query(
      `INSERT INTO placement_companies (tenant_id, company_name, hr_name, hr_email, hr_mobile, industry, hr_contacts, company_profile)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [
        this.tenant(tenantId),
        dto.name ?? dto.company_name,
        dto.hr_name ?? dto.hr_contact_name ?? 'HR',
        dto.hr_email ?? 'hr@company.com',
        dto.hr_mobile ?? null,
        dto.industry ?? null,
        JSON.stringify(dto.hr_contacts ?? []),
        JSON.stringify(dto.company_profile ?? {}),
      ],
    );
  }

  async drives(
    tenantId?: string,
    activeOnly = false,
    options?: { limit?: number; offset?: number },
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { limit, offset } = parsePageParams(
      options?.limit,
      options?.offset,
      DEFAULT_PAGE_LIMIT,
    );
    const s = await this.schema();
    const d = this.driveSelect(s);
    const statusFilter = activeOnly ? `AND ${this.activeFilter()}` : '';
    const tenantFilter = s.tenantScoped
      ? `WHERE d.tenant_id = $1 ${statusFilter}`
      : `WHERE TRUE ${statusFilter}`;
    const baseParams = s.tenantScoped ? [this.tenant(tenantId)] : [];

    const countRows = await this.db.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM ${d.from} ${tenantFilter}`,
      baseParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const params = [...baseParams, limit, offset];
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const data = await this.db.query(
      `SELECT ${d.select}
       FROM ${d.from}
       ${tenantFilter}
       ORDER BY d.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return { data, total, limit, offset };
  }

  async getDrive(tenantId: string, driveId: string) {
    const s = await this.schema();
    const d = this.driveSelect(s);
    const tenantClause = s.tenantScoped ? `AND d.tenant_id = $2` : '';
    const params = s.tenantScoped
      ? [driveId, this.tenant(tenantId)]
      : [driveId];

    const rows = await this.db.query(
      `SELECT ${d.select}${s.companyJoin ? ', c.industry, c.hr_name, c.hr_email' : ''}
       FROM ${d.from}
       WHERE d.${s.driveIdCol} = $1 ${tenantClause}`,
      params,
    );
    if (!rows[0]) throw new NotFoundException('Drive not found');
    return rows[0];
  }

  async createDrive(tenantId: string, dto: Record<string, unknown>) {
    const s = await this.schema();
    const deadline = dto.deadline ?? dto.drive_date ?? null;
    const packageLpa = dto.package_lpa ?? dto.package_details_lpa ?? null;
    const jobRole = dto.job_role ?? dto.job_profile;

    const company = await this.db.query<Array<{ company_name: string }>>(
      `SELECT company_name FROM placement_companies WHERE company_id = $1`,
      [dto.company_id],
    );
    const companyName = company[0]?.company_name ?? 'Company';

    let rows: Array<Record<string, unknown>>;

    if (s.drivesTable === 'placement_ats_drives') {
      rows = await this.db.query(
        `INSERT INTO placement_ats_drives
           (tenant_id, company_id, job_profile, job_role, description, package_details_lpa, package_lpa,
            min_cgpa, max_backlogs, max_active_backlogs, drive_date, deadline, status)
         VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $7, $8::date, $9::timestamptz, 'ACTIVE')
         RETURNING *`,
        [
          this.tenant(tenantId),
          dto.company_id,
          jobRole,
          dto.description ?? null,
          packageLpa,
          this.numField(dto.min_cgpa, 6.0),
          this.numField(dto.max_active_backlogs ?? dto.max_backlogs, 0),
          dto.drive_date ?? null,
          deadline,
        ],
      );
    } else if (s.tenantScoped && s.companyJoin) {
      rows = await this.db.query(
        `INSERT INTO placement_drives
           (tenant_id, company_id, job_profile, job_role, description, package_details_lpa, package_lpa,
            min_cgpa, max_backlogs, max_active_backlogs, drive_date, deadline, status)
         VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $7, $8::date, $9::timestamptz, 'ACTIVE')
         RETURNING *`,
        [
          this.tenant(tenantId),
          dto.company_id,
          jobRole,
          dto.description ?? null,
          packageLpa,
          this.numField(dto.min_cgpa, 6.0),
          this.numField(dto.max_active_backlogs ?? dto.max_backlogs, 0),
          dto.drive_date ?? null,
          deadline,
        ],
      );
    } else {
      rows = await this.db.query(
        `INSERT INTO placement_drives
           (company_name, role_title, job_role, description, package_lpa, min_cgpa, max_backlogs, max_active_backlogs, deadline, status)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $6, $7::timestamptz, 'ACTIVE')
         RETURNING *`,
        [
          companyName,
          jobRole,
          dto.description ?? null,
          packageLpa,
          this.numField(dto.min_cgpa, 6.0),
          this.numField(dto.max_active_backlogs ?? dto.max_backlogs, 0),
          deadline,
        ],
      );
    }

    const drive = rows[0] as {
      drive_id?: string;
      placement_drive_id?: string;
      deadline?: string;
      job_profile?: string;
    };
    const driveId = String(drive.drive_id ?? drive.placement_drive_id ?? '');
    const roleTitle = String(drive.job_profile ?? jobRole ?? 'Role');
    const deadlineLabel = drive.deadline
      ? new Date(drive.deadline).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })
      : 'the deadline';

    const students = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
      [this.tenant(tenantId)],
    );
    for (const student of students) {
      this.notify.jobPosted({
        tenantId: this.tenant(tenantId),
        userId: student.user_id,
        companyName,
        roleTitle,
        title: `New Drive: ${companyName}`,
        message: `${companyName} is hiring ${roleTitle}. Apply before ${deadlineLabel}!`,
        actionLink: `/student/placements?drive=${driveId}`,
      });
    }
    return rows.map((r) => ({
      ...r,
      drive_id: r.drive_id ?? r.placement_drive_id,
    }));
  }

  async updateDrive(
    tenantId: string,
    driveId: string,
    dto: Record<string, unknown>,
  ) {
    const s = await this.schema();
    await this.getDrive(tenantId, driveId);

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    };

    if (dto.job_profile !== undefined || dto.job_role !== undefined) {
      const role = dto.job_role ?? dto.job_profile;
      if (s.drivesTable === 'placement_ats_drives' || s.companyJoin) {
        add('job_profile', role);
        add('job_role', role);
      } else {
        add('role_title', role);
        add('job_role', role);
      }
    }
    if (dto.description !== undefined) add('description', dto.description);
    if (
      dto.package_lpa !== undefined ||
      dto.package_details_lpa !== undefined
    ) {
      const pkg = dto.package_lpa ?? dto.package_details_lpa;
      if (s.drivesTable === 'placement_ats_drives' || s.companyJoin) {
        add('package_lpa', pkg);
        add('package_details_lpa', pkg);
      } else {
        add('package_lpa', pkg);
      }
    }
    if (dto.min_cgpa !== undefined)
      add('min_cgpa', this.numField(dto.min_cgpa, 0));
    if (
      dto.max_backlogs !== undefined ||
      dto.max_active_backlogs !== undefined
    ) {
      const backlogs = this.numField(
        dto.max_active_backlogs ?? dto.max_backlogs,
        0,
      );
      add('max_backlogs', backlogs);
      if (s.drivesTable === 'placement_ats_drives' || s.tenantScoped) {
        add('max_active_backlogs', backlogs);
      }
    }
    if (dto.deadline !== undefined) add('deadline', dto.deadline);
    if (dto.status !== undefined) add('status', dto.status);

    if (!sets.length) throw new BadRequestException('No fields to update');

    params.push(driveId);
    let tenantClause = '';
    if (s.tenantScoped) {
      params.push(this.tenant(tenantId));
      tenantClause = ` AND tenant_id = $${idx + 1}`;
    }

    const rows = await this.db.query(
      `UPDATE ${s.drivesTable} SET ${sets.join(', ')} WHERE ${s.driveIdCol} = $${idx}${tenantClause} RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundException('Drive not found');
    return {
      ...rows[0],
      drive_id: rows[0].drive_id ?? rows[0].placement_drive_id,
    };
  }

  async checkEligibility(
    studentUserId: string,
    driveId: string,
    tenantId?: string,
  ) {
    const s = await this.schema();
    const d = this.driveSelect(s);

    const drives = await this.db.query(
      `SELECT d.*, ${d.pkgExpr} AS package_lpa, ${d.backlogExpr} AS max_active_backlogs
       FROM ${s.drivesTable} d WHERE d.${s.driveIdCol} = $1`,
      [driveId],
    );
    const drive = drives[0] as
      | {
          min_cgpa: string;
          max_active_backlogs: number;
          package_lpa: string;
          status: string;
        }
      | undefined;
    if (!drive) throw new NotFoundException('Drive not found');

    const { cgpa, backlogs } = await this.getStudentAcademics(studentUserId);
    const lock = await this.getPlacementLock(studentUserId);
    const packageLpa = Number(drive.package_lpa ?? 0);
    const minCgpa = Number(drive.min_cgpa);
    const maxBacklogs = Number(drive.max_active_backlogs);
    const isActive = drive.status === 'ACTIVE' || drive.status === 'OPEN';

    let eligible = cgpa >= minCgpa && backlogs <= maxBacklogs && isActive;
    let reason: string | null = null;

    if (!eligible) {
      if (cgpa < minCgpa) {
        reason = `Ineligible: Minimum ${minCgpa.toFixed(1)} CGPA required. Your CGPA is ${cgpa.toFixed(2)}.`;
      } else if (backlogs > maxBacklogs) {
        reason = `Ineligible: Maximum ${maxBacklogs} active backlogs allowed. You have ${backlogs}.`;
      } else if (!isActive) {
        reason = 'This drive is no longer accepting applications.';
      }
    }

    if (
      eligible &&
      lock.locked &&
      lock.offerLpa !== null &&
      packageLpa < lock.offerLpa
    ) {
      eligible = false;
      reason =
        lock.reason ??
        `Placement locked: You hold an offer of ₹${lock.offerLpa} LPA. Lower-tier drives are unavailable.`;
    }

    const existing = await this.findApplication(s, driveId, studentUserId);

    return {
      eligible,
      cgpa,
      backlogs,
      min_cgpa: minCgpa,
      max_backlogs: maxBacklogs,
      package_lpa: packageLpa,
      is_placement_locked: lock.locked,
      placement_offer_lpa: lock.offerLpa,
      already_applied: Boolean(existing),
      application_id: existing?.application_id ?? null,
      pipeline_stage: existing?.pipeline_stage ?? null,
      reason,
      tenant_id: tenantId ?? null,
    };
  }

  private async findApplication(
    s: PlacementSchema,
    driveId: string,
    studentUserId: string,
  ) {
    if (s.appsTable === 'placement_applications') {
      const profile = await this.db.query(
        `SELECT student_profile_id FROM student_profiles WHERE user_id = $1 LIMIT 1`,
        [studentUserId],
      );
      const profileId = (
        profile[0] as { student_profile_id?: string } | undefined
      )?.student_profile_id;
      if (!profileId) return null;
      const rows = await this.db.query(
        `SELECT placement_application_id AS application_id,
                COALESCE(status, 'APPLIED') AS pipeline_stage
         FROM placement_applications
         WHERE placement_drive_id = $1 AND student_profile_id = $2`,
        [driveId, profileId],
      );
      return rows[0] as {
        application_id: string;
        pipeline_stage: string;
      } | null;
    }

    const rows = await this.db.query(
      `SELECT application_id, pipeline_stage FROM ${s.appsTable}
       WHERE drive_id = $1 AND student_user_id = $2`,
      [driveId, studentUserId],
    );
    return (
      (rows[0] as
        | { application_id: string; pipeline_stage: string }
        | undefined) ?? null
    );
  }

  private async resolveResumePath(
    tenantId: string,
    studentUserId: string,
    resumeFilePath?: string | null,
  ): Promise<string> {
    if (resumeFilePath?.trim()) return resumeFilePath.trim();

    const profile = await this.db.query(
      `SELECT resume_pdf_path FROM student_resume_profiles WHERE student_user_id = $1`,
      [studentUserId],
    );
    const existing = (profile[0] as { resume_pdf_path?: string } | undefined)
      ?.resume_pdf_path;
    if (existing) return existing;

    const generated = await this.generateResumePdf(tenantId, studentUserId);
    return generated.resume_pdf_path;
  }

  async applyToDrive(
    tenantId: string,
    studentUserId: string,
    driveId: string,
    resumeFilePath?: string | null,
  ) {
    const s = await this.schema();
    const check = await this.checkEligibility(studentUserId, driveId, tenantId);
    if (!check.eligible) {
      throw new BadRequestException(
        check.reason ?? 'Not eligible for this drive',
      );
    }
    if (check.already_applied) {
      throw new BadRequestException('You have already applied to this drive');
    }

    if (!resumeFilePath?.trim()) {
      throw new BadRequestException(
        'Resume upload is required before applying',
      );
    }
    const resumePath = resumeFilePath.trim();

    if (s.appsTable === 'placement_applications') {
      const profile = await this.db.query(
        `SELECT student_profile_id FROM student_profiles WHERE user_id = $1 LIMIT 1`,
        [studentUserId],
      );
      const profileId = (profile[0] as { student_profile_id: string })
        .student_profile_id;
      return this.db.query(
        `INSERT INTO placement_applications
           (placement_drive_id, student_profile_id, student_user_id, tenant_id,
            eligibility_status, status, cgpa_at_apply, active_backlogs_at_apply)
         VALUES ($1, $2, $3, $4, 'ELIGIBLE', 'APPLIED', $5, $6)
         RETURNING placement_application_id AS application_id, status AS pipeline_stage`,
        [
          driveId,
          profileId,
          studentUserId,
          this.tenant(tenantId),
          check.cgpa,
          check.backlogs,
        ],
      );
    }

    return this.db.query(
      `INSERT INTO ${s.appsTable}
         (tenant_id, drive_id, student_user_id, eligibility_status, pipeline_stage,
          resume_file_path, cgpa_at_apply, active_backlogs_at_apply)
       VALUES ($1, $2, $3, 'ELIGIBLE', 'APPLIED', $4, $5, $6)
       RETURNING *`,
      [
        this.tenant(tenantId),
        driveId,
        studentUserId,
        resumePath,
        check.cgpa,
        check.backlogs,
      ],
    );
  }

  async getStudentPlacementsHub(tenantId: string, studentUserId: string) {
    const s = await this.schema();
    const openDrivesPage = await this.drives(tenantId, true, {
      limit: 100,
      offset: 0,
    });
    const openDrives = openDrivesPage.data;
    const d = this.driveSelect(s);

    let applications: unknown[];
    if (s.appsTable === 'placement_applications') {
      applications = await this.db.query(
        `SELECT a.placement_application_id AS application_id,
                COALESCE(a.status, 'APPLIED') AS pipeline_stage,
                a.applied_at, ${d.roleExpr} AS job_role, ${d.pkgExpr} AS package_lpa,
                d.${s.driveIdCol} AS drive_id, d.min_cgpa, ${d.deadlineExpr} AS deadline, d.status AS drive_status,
                d.company_name
         FROM placement_applications a
         JOIN ${s.drivesTable} d ON d.${s.driveIdCol} = a.placement_drive_id
         WHERE a.student_user_id = $1
         ORDER BY a.applied_at DESC NULLS LAST, a.created_at DESC`,
        [studentUserId],
      );
    } else {
      applications = await this.db.query(
        `SELECT a.application_id, a.pipeline_stage, a.rejected_at_stage, a.applied_at, a.resume_file_path,
                ${d.roleExpr} AS job_role, ${d.pkgExpr} AS package_lpa,
                d.${s.driveIdCol} AS drive_id, d.min_cgpa, ${d.deadlineExpr} AS deadline, d.status AS drive_status,
                ${d.companyName} AS company_name
         FROM ${s.appsTable} a
         JOIN ${s.drivesTable} d ON d.${s.driveIdCol} = a.drive_id
         ${s.companyJoin ? 'JOIN placement_companies c ON c.company_id = d.company_id' : ''}
         WHERE a.student_user_id = $1 ${s.tenantScoped ? 'AND a.tenant_id = $2' : ''}
         ORDER BY a.applied_at DESC`,
        s.tenantScoped
          ? [studentUserId, this.tenant(tenantId)]
          : [studentUserId],
      );
    }

    const lock = await this.getPlacementLock(studentUserId);
    const { cgpa, backlogs } = await this.getStudentAcademics(studentUserId);

    const enrichedDrives = await Promise.all(
      openDrives.map(async (drive) => {
        const driveId = String(drive.drive_id);
        const eligibility = await this.checkEligibility(
          studentUserId,
          driveId,
          tenantId,
        );
        return { ...drive, eligibility };
      }),
    );

    return {
      open_drives: enrichedDrives,
      my_applications: applications,
      student_cgpa: cgpa,
      student_backlogs: backlogs,
      placement_lock: lock,
    };
  }

  async getDrivePipeline(tenantId: string, driveId: string) {
    const s = await this.schema();
    await this.getDrive(tenantId, driveId);

    let apps: Array<{ pipeline_stage: string }>;
    if (s.appsTable === 'placement_applications') {
      apps = await this.db.query(
        `SELECT a.placement_application_id AS application_id,
                COALESCE(a.status, 'APPLIED') AS pipeline_stage,
                a.applied_at, a.cgpa_at_apply,
                u.user_id AS student_user_id, u.name AS student_name, u.official_email AS student_email,
                sp.enrollment_number, sp.enrollment_no,
                COALESCE(sp.parent_info->>'student_mobile', sp.parent_info->>'mobile') AS student_mobile
         FROM placement_applications a
         JOIN users u ON u.user_id = a.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE a.placement_drive_id = $1
         ORDER BY a.applied_at ASC NULLS LAST, a.created_at ASC`,
        [driveId],
      );
    } else {
      apps = await this.db.query(
        `SELECT a.application_id, a.pipeline_stage, a.rejected_at_stage, a.applied_at, a.updated_at,
                a.resume_file_path, a.cgpa_at_apply, a.active_backlogs_at_apply,
                u.user_id AS student_user_id, u.name AS student_name, u.official_email AS student_email,
                sp.enrollment_number, sp.enrollment_no,
                COALESCE(sp.parent_info->>'student_mobile', sp.parent_info->>'mobile') AS student_mobile
         FROM ${s.appsTable} a
         JOIN users u ON u.user_id = a.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE a.drive_id = $1 ${s.tenantScoped ? 'AND a.tenant_id = $2' : ''}
         ORDER BY a.applied_at ASC`,
        s.tenantScoped ? [driveId, this.tenant(tenantId)] : [driveId],
      );
    }

    const columns: Record<string, unknown[]> = {};
    for (const stage of PLACEMENT_KANBAN_COLUMNS) {
      columns[stage] = apps.filter((row) => row.pipeline_stage === stage);
    }
    return { drive_id: driveId, columns, stages: PLACEMENT_KANBAN_COLUMNS };
  }

  private stageLabel(stage: PlacementPipelineStage) {
    const labels: Record<PlacementPipelineStage, string> = {
      APPLIED: 'Applied',
      APTITUDE_CLEARED: 'Aptitude Cleared',
      TECH_INTERVIEW: 'Tech Interview',
      HR_INTERVIEW: 'HR Interview',
      OFFERED: 'Offered',
      REJECTED: 'Rejected',
    };
    return labels[stage] ?? stage;
  }

  private async syncIqacOutcome(
    tenantId: string,
    driveId: string,
    studentUserId: string,
    applicationId: string,
    status: 'OFFERED' | 'REJECTED',
  ) {
    const drive = (await this.getDrive(tenantId, driveId)) as {
      company_name: string;
      job_role?: string;
      job_profile?: string;
      package_lpa?: string;
      deadline?: string;
    };

    const packageLpa = drive.package_lpa ?? null;
    const roleTitle = drive.job_role ?? drive.job_profile ?? 'Role';

    const jobRows = await this.db.query(
      `SELECT job_id FROM placement_job_postings WHERE drive_id = $1 LIMIT 1`,
      [driveId],
    );
    let jobId = (jobRows[0] as { job_id?: string } | undefined)?.job_id;
    if (!jobId) {
      const inserted = await this.db.query(
        `INSERT INTO placement_job_postings
           (company_name, role_title, description, ctc_lpa, status, drive_id, apply_deadline)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6::date)
         RETURNING job_id`,
        [
          drive.company_name,
          roleTitle,
          null,
          packageLpa,
          driveId,
          drive.deadline ?? null,
        ],
      );
      jobId = (inserted[0] as { job_id: string }).job_id;
    }

    await this.db.query(
      `INSERT INTO placement_job_applications (job_id, student_user_id, status, drive_application_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, student_user_id) DO UPDATE
         SET status = EXCLUDED.status, updated_at = NOW()`,
      [jobId, studentUserId, status, applicationId],
    );

    if (status === 'OFFERED') {
      try {
        await this.db.query(
          `REFRESH MATERIALIZED VIEW CONCURRENTLY iqac_mv_placement_stats`,
        );
      } catch {
        await this.db.query(
          `REFRESH MATERIALIZED VIEW iqac_mv_placement_stats`,
        );
      }
    }
  }

  private async applyPlacementLock(studentUserId: string, packageLpa: number) {
    if (packageLpa <= PLACEMENT_TIER1_LPA_THRESHOLD) return;

    const reason = `Tier-1 offer of ₹${packageLpa} LPA received. Lower-tier campus drives are now locked per university policy.`;
    await this.db.query(
      `UPDATE student_profiles
       SET is_placement_locked = TRUE,
           placement_offer_lpa = GREATEST(COALESCE(placement_offer_lpa, 0), $2),
           placement_lock_reason = $3
       WHERE user_id = $1`,
      [studentUserId, packageLpa, reason],
    );
  }

  async updateApplicationStage(
    tenantId: string,
    applicationId: string,
    stage: PlacementPipelineStage,
    rejectedAtStage?: PlacementPipelineStage | null,
  ) {
    const s = await this.schema();
    const d = this.driveSelect(s);

    let apps: Array<Record<string, unknown>>;
    if (s.appsTable === 'placement_applications') {
      apps = await this.db.query(
        `SELECT a.placement_application_id AS application_id,
                a.placement_drive_id AS drive_id, a.student_user_id,
                COALESCE(a.status, 'APPLIED') AS pipeline_stage,
                ${d.roleExpr} AS job_role, ${d.pkgExpr} AS package_lpa,
                d.company_name
         FROM placement_applications a
         JOIN ${s.drivesTable} d ON d.${s.driveIdCol} = a.placement_drive_id
         WHERE a.placement_application_id = $1`,
        [applicationId],
      );
    } else {
      apps = await this.db.query(
        `SELECT a.*, ${d.roleExpr} AS job_role, ${d.pkgExpr} AS package_lpa, ${d.companyName} AS company_name
         FROM ${s.appsTable} a
         JOIN ${s.drivesTable} d ON d.${s.driveIdCol} = a.drive_id
         ${s.companyJoin ? 'JOIN placement_companies c ON c.company_id = d.company_id' : ''}
         WHERE a.application_id = $1 ${s.tenantScoped ? 'AND a.tenant_id = $2' : ''}`,
        s.tenantScoped
          ? [applicationId, this.tenant(tenantId)]
          : [applicationId],
      );
    }

    const app = apps[0] as
      | {
          application_id: string;
          drive_id: string;
          student_user_id: string;
          pipeline_stage: string;
          company_name: string;
          job_role: string;
          package_lpa: string;
        }
      | undefined;
    if (!app) throw new NotFoundException('Application not found');

    const rejectedStage =
      stage === 'REJECTED' ? (rejectedAtStage ?? app.pipeline_stage) : null;

    if (s.appsTable === 'placement_applications') {
      await this.db.query(
        `UPDATE placement_applications SET status = $2 WHERE placement_application_id = $1`,
        [applicationId, stage],
      );
    } else {
      await this.db.query(
        `UPDATE ${s.appsTable}
         SET pipeline_stage = $2, rejected_at_stage = $3, updated_at = NOW()
         WHERE application_id = $1`,
        [applicationId, stage, rejectedStage],
      );
    }

    const companyName = app.company_name;
    const roleTitle = app.job_role;

    if (stage === 'REJECTED') {
      this.notify.placementStageUpdated({
        tenantId: this.tenant(tenantId),
        userId: app.student_user_id,
        companyName,
        roleTitle,
        stage,
        title: `Update: ${companyName}`,
        message: `Your application for ${roleTitle} at ${companyName} was not progressed further at the ${this.stageLabel(rejectedStage as PlacementPipelineStage)} stage.`,
        actionLink: '/student/placements',
      });
    } else if (stage === 'OFFERED') {
      const packageLpa = Number(app.package_lpa ?? 0);
      await this.applyPlacementLock(app.student_user_id, packageLpa);
      await this.syncIqacOutcome(
        tenantId,
        app.drive_id,
        app.student_user_id,
        applicationId,
        'OFFERED',
      );
      this.notify.placementStageUpdated({
        tenantId: this.tenant(tenantId),
        userId: app.student_user_id,
        companyName,
        roleTitle,
        stage,
        title: `Offer from ${companyName}!`,
        message: `Congratulations! You have received an offer for ${roleTitle} at ${companyName}.`,
        actionLink: '/student/placements',
      });
    } else {
      this.notify.placementStageUpdated({
        tenantId: this.tenant(tenantId),
        userId: app.student_user_id,
        companyName,
        roleTitle,
        stage,
        title: `Shortlisted: ${companyName}`,
        message: `Congratulations! You have been shortlisted for the ${this.stageLabel(stage)} at ${companyName}.`,
        actionLink: '/student/placements',
      });
    }

    return {
      application_id: applicationId,
      pipeline_stage: stage,
      rejected_at_stage: rejectedStage,
    };
  }

  async exportDriveApplicants(
    tenantId: string,
    driveId: string,
    stage: PlacementPipelineStage = 'APPLIED',
  ): Promise<Buffer> {
    const s = await this.schema();
    await this.getDrive(tenantId, driveId);

    let rows: Record<string, unknown>[];
    if (s.appsTable === 'placement_applications') {
      rows = await this.db.query(
        `SELECT u.name AS student_name, u.official_email AS student_email,
                COALESCE(sp.enrollment_number, sp.enrollment_no, u.user_id::text) AS enrollment_no,
                COALESCE(sp.parent_info->>'student_mobile', sp.parent_info->>'mobile', '') AS phone,
                a.cgpa_at_apply AS cgpa, a.active_backlogs_at_apply AS backlogs,
                a.applied_at, COALESCE(a.status, 'APPLIED') AS pipeline_stage
         FROM placement_applications a
         JOIN users u ON u.user_id = a.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE a.placement_drive_id = $1 AND COALESCE(a.status, 'APPLIED') = $2
         ORDER BY u.name`,
        [driveId, stage],
      );
    } else {
      rows = await this.db.query(
        `SELECT u.name AS student_name, u.official_email AS student_email,
                COALESCE(sp.enrollment_number, sp.enrollment_no, u.user_id::text) AS enrollment_no,
                COALESCE(sp.parent_info->>'student_mobile', sp.parent_info->>'mobile', '') AS phone,
                a.cgpa_at_apply AS cgpa, a.active_backlogs_at_apply AS backlogs,
                a.resume_file_path, a.applied_at, a.pipeline_stage
         FROM ${s.appsTable} a
         JOIN users u ON u.user_id = a.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE a.drive_id = $1 ${s.tenantScoped ? 'AND a.tenant_id = $2' : ''} AND a.pipeline_stage = $${s.tenantScoped ? 3 : 2}
         ORDER BY u.name`,
        s.tenantScoped
          ? [driveId, this.tenant(tenantId), stage]
          : [driveId, stage],
      );
    }

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Applicants');
    sheet.columns = [
      { header: 'Name', key: 'student_name', width: 28 },
      { header: 'Enrollment', key: 'enrollment_no', width: 18 },
      { header: 'Email', key: 'student_email', width: 32 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'CGPA', key: 'cgpa', width: 10 },
      { header: 'Backlogs', key: 'backlogs', width: 10 },
      { header: 'Resume', key: 'resume_file_path', width: 48 },
      { header: 'Applied At', key: 'applied_at', width: 22 },
      { header: 'Stage', key: 'pipeline_stage', width: 18 },
    ];
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  jobs(tenantId?: string) {
    return this.db.query(
      `SELECT j.*, c.company_name
       FROM placement_job_descriptions j
       JOIN placement_companies c ON c.company_id = j.company_id
       WHERE j.tenant_id = $1
       ORDER BY j.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  resumes(tenantId?: string) {
    return this.db.query(
      `SELECT r.*, u.name AS student_name, u.official_email AS student_email
       FROM student_resume_profiles r
       JOIN users u ON u.user_id = r.student_user_id
       WHERE r.tenant_id = $1
       ORDER BY r.updated_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  mockInterviews(tenantId?: string) {
    return this.db.query(
      `SELECT m.*, u.name AS student_name, interviewer.name AS interviewer_name
       FROM placement_mock_interviews m
       JOIN users u ON u.user_id = m.student_user_id
       LEFT JOIN users interviewer ON interviewer.user_id = m.interviewer_user_id
       WHERE m.tenant_id = $1
       ORDER BY m.scheduled_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  skillMatrix(studentUserId: string) {
    return this.db.query(
      `SELECT * FROM placement_skill_matrix WHERE student_user_id = $1 ORDER BY skill_name`,
      [studentUserId],
    );
  }

  trainingSessions(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM placement_training_sessions WHERE tenant_id = $1 ORDER BY session_date`,
      [this.tenant(tenantId)],
    );
  }

  async generateResumePdf(tenantId: string, studentUserId: string) {
    const user = await this.db.query(
      `SELECT name, official_email FROM users WHERE user_id = $1`,
      [studentUserId],
    );
    const resume = await this.db.query(
      `SELECT * FROM student_resume_profiles WHERE student_user_id = $1`,
      [studentUserId],
    );
    const u = user[0] as { name: string; official_email: string };
    const r = resume[0] as
      | { skills: string[]; projects: unknown[] }
      | undefined;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Suresh Gyan Vihar University', {
      x: 50,
      y: 780,
      size: 14,
      font: bold,
      color: rgb(0.03, 0.14, 0.29),
    });
    page.drawText(u?.name ?? 'Student', {
      x: 50,
      y: 750,
      size: 18,
      font: bold,
    });
    page.drawText(u?.official_email ?? '', { x: 50, y: 730, size: 10, font });
    page.drawText('Skills: ' + ((r?.skills ?? []).join(', ') || '—'), {
      x: 50,
      y: 700,
      size: 10,
      font,
    });
    const bytes = await pdf.save();

    const filename = `${studentUserId}.pdf`;
    let url: string;

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(
        this.tenant(tenantId),
        `resumes/${filename}`,
      );
      const stored = await this.objectStorage.upload(
        this.tenant(tenantId),
        key,
        Buffer.from(bytes),
        'application/pdf',
      );
      url = stored.url;
    } else {
      const rel = path.join(tenantId, 'resumes', filename);
      const abs = path.join(process.cwd(), 'uploads', rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
      url = `/uploads/${rel}`.replace(/\\/g, '/');
    }

    await this.db.query(
      `INSERT INTO student_resume_profiles (tenant_id, student_user_id, skills, resume_pdf_path)
       VALUES ($1, $2, '{}', $3)
       ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET resume_pdf_path = EXCLUDED.resume_pdf_path`,
      [this.tenant(tenantId), studentUserId, url],
    );
    return { resume_pdf_path: url };
  }
}

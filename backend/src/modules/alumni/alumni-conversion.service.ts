import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  ALUMNI_CONVERSION_QUEUE,
  AlumniConversionJob,
} from '../../common/constants/alumni-queue.constants';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const FINAL_SEMESTER = 8;

export type ClearanceStatus = {
  library: boolean;
  hostel: boolean;
  dept: boolean;
  finance: boolean;
  all_cleared: boolean;
};

export type AlumniConversionEligibility = {
  eligible: boolean;
  current_semester: number;
  max_semester: number;
  no_dues: { finance: boolean; library: boolean; hostel: boolean; all_cleared: boolean };
  final_semester_results_published: boolean;
  active_backlogs: number;
  blockers: string[];
  alumni_converted: boolean;
  request_pending: boolean;
};

@Injectable()
export class AlumniConversionService {
  private readonly logger = new Logger(AlumniConversionService.name);

  constructor(
    @InjectQueue(ALUMNI_CONVERSION_QUEUE) private readonly queue: Queue<AlumniConversionJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async getConversionEligibility(tenantId: string, studentUserId: string): Promise<AlumniConversionEligibility> {
    const blockers: string[] = [];

    const clearance = await this.getClearanceStatus(tenantId, studentUserId);
    const noDues = {
      finance: clearance.finance,
      library: clearance.library,
      hostel: clearance.hostel,
      all_cleared: clearance.finance && clearance.library && clearance.hostel,
    };
    if (!noDues.finance) blockers.push('Finance no-dues pending');
    if (!noDues.library) blockers.push('Library no-dues pending');
    if (!noDues.hostel) blockers.push('Hostel no-dues pending');

    const semRows = await this.dataSource.query<
      Array<{ max_semester: number; current_semester: number }>
    >(
      `SELECT COALESCE(MAX(e.semester), 0)::int AS max_semester,
              COALESCE(
                (SELECT MAX(e2.semester) FROM student_course_enrollments e2
                 WHERE e2.student_user_id = $1 AND e2.status IN ('IN_PROGRESS', 'ENROLLED', 'REGISTERED')),
                MAX(e.semester),
                0
              )::int AS current_semester
       FROM student_course_enrollments e
       WHERE e.student_user_id = $1`,
      [studentUserId],
    );
    const maxSemester = Number(semRows[0]?.max_semester ?? 0);
    const currentSemester = Number(semRows[0]?.current_semester ?? maxSemester);

    if (maxSemester < FINAL_SEMESTER) {
      blockers.push(`Final semester (${FINAL_SEMESTER}) not reached — you are in semester ${Math.max(currentSemester, maxSemester)}`);
    }

    const backlogRows = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM student_course_enrollments
       WHERE student_user_id = $1 AND status = 'FAILED'`,
      [studentUserId],
    );
    const activeBacklogs = Number(backlogRows[0]?.count ?? 0);
    if (activeBacklogs > 0) {
      blockers.push(`${activeBacklogs} active backlog(s) must be cleared first`);
    }

    const gradeRows = await this.dataSource.query<Array<{ published: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM grade_cards
         WHERE tenant_id = $1 AND student_user_id = $2
           AND semester = $3 AND status = 'PUBLISHED'
       ) AS published`,
      [tenantId, studentUserId, FINAL_SEMESTER],
    );
    let finalSemesterPublished = Boolean(gradeRows[0]?.published);

    if (!finalSemesterPublished) {
      const profileRows = await this.dataSource.query<Array<{ final_result: string | null }>>(
        `SELECT final_result FROM student_profiles WHERE user_id = $1`,
        [studentUserId],
      );
      const finalResult = profileRows[0]?.final_result ?? '';
      if (maxSemester >= FINAL_SEMESTER && /pass/i.test(finalResult)) {
        finalSemesterPublished = true;
      }
    }

    if (!finalSemesterPublished) {
      blockers.push(`Semester ${FINAL_SEMESTER} results are not published yet`);
    }

    const statusRows = await this.dataSource.query<
      Array<{ alumni_converted: boolean; request_pending: boolean }>
    >(
      `SELECT COALESCE(c.alumni_converted, false) AS alumni_converted,
              EXISTS (
                SELECT 1 FROM alumni_profiles p
                WHERE p.tenant_id = $1 AND p.student_user_id = $2
                  AND p.verification_status = 'PENDING'
              ) AS request_pending
       FROM student_exit_clearances c
       WHERE c.tenant_id = $1 AND c.student_user_id = $2`,
      [tenantId, studentUserId],
    );
    const alumniConverted = Boolean(statusRows[0]?.alumni_converted);
    const requestPending = Boolean(statusRows[0]?.request_pending);

    if (alumniConverted) blockers.push('Already converted to Alumni');
    if (requestPending) blockers.push('Alumni conversion request already pending review');

    const eligible = blockers.length === 0;

    return {
      eligible,
      current_semester: currentSemester,
      max_semester: maxSemester,
      no_dues: noDues,
      final_semester_results_published: finalSemesterPublished,
      active_backlogs: activeBacklogs,
      blockers,
      alumni_converted: alumniConverted,
      request_pending: requestPending,
    };
  }

  /** Student submits conversion request — creates PENDING profile, routes to IQAC/Registrar only. */
  async submitConversionRequest(
    tenantId: string,
    studentUserId: string,
    dto: {
      linkedin_url: string;
      organization?: string;
      higher_education_details?: Record<string, unknown>;
      personal_email?: string;
    },
  ) {
    if (!tenantId?.trim()) {
      throw new InternalServerErrorException(
        'Tenant context missing on your session. Sign out and sign in again, then retry.',
      );
    }

    const eligibility = await this.getConversionEligibility(tenantId, studentUserId);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        eligibility.blockers[0] ?? 'You are not eligible for alumni conversion yet.',
      );
    }

    const users = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        student_profile_id: string | null;
        enrollment_no: string | null;
        program_name: string | null;
        graduation_year: number | null;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email,
              sp.student_profile_id, sp.enrollment_no,
              (SELECT sa.program_applied FROM student_applications sa
               WHERE sa.student_user_id = u.user_id
               ORDER BY sa.created_at DESC LIMIT 1) AS program_name,
              CASE WHEN sp.batch ~ '^[0-9]{4}$' THEN CAST(sp.batch AS INT) ELSE NULL END AS graduation_year
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [studentUserId, tenantId],
    );
    const user = users[0];
    if (!user) throw new NotFoundException('Student not found');

    const batchYear = user.graduation_year ?? new Date().getFullYear();
    const higherEd = dto.higher_education_details ?? {};
    const existing = await this.dataSource.query(
      `SELECT COALESCE(p.alumni_id, p.alumni_profile_id) AS row_id, p.verification_status
       FROM alumni_profiles p
       WHERE p.tenant_id = $1 AND p.student_user_id = $2`,
      [tenantId, studentUserId],
    );

    if (existing[0]?.verification_status === 'VERIFIED') {
      throw new ConflictException('Alumni conversion is already complete.');
    }

    if (existing[0]) {
      await this.dataSource.query(
        `UPDATE alumni_profiles
         SET verification_status = 'PENDING',
             linkedin_url = $2,
             current_organization = COALESCE($3, current_organization),
             personal_email = COALESCE($4, personal_email),
             higher_education_details = COALESCE($5, higher_education_details),
             profile_updated_at = NOW()
         WHERE COALESCE(alumni_id, alumni_profile_id) = $1`,
        [
          existing[0].row_id,
          dto.linkedin_url,
          dto.organization ?? null,
          dto.personal_email ?? null,
          JSON.stringify(higherEd),
        ],
      );
    } else {
      const newAlumniId = randomUUID();
      await this.dataSource.query(
        `INSERT INTO alumni_profiles (
           tenant_id, alumni_profile_id, alumni_id, student_profile_id, student_user_id, user_id,
           name, email, personal_email, enrollment_number, batch_year, graduation_year, program_name,
           current_organization, linkedin_url, higher_education_details, verification_status, profile_updated_at
         ) VALUES ($1, $2, $2, $3, $4, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13::jsonb, 'PENDING', NOW())`,
        [
          tenantId,
          newAlumniId,
          user.student_profile_id ?? null,
          studentUserId,
          user.name,
          user.official_email,
          dto.personal_email ?? null,
          user.enrollment_no,
          batchYear,
          user.program_name,
          dto.organization ?? null,
          dto.linkedin_url,
          JSON.stringify(higherEd),
        ],
      );
    }

    await this.dataSource.query(
      `INSERT INTO student_exit_clearances (
         tenant_id, student_user_id, linkedin_url, placement_organization, personal_email, conversion_requested_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET
         linkedin_url = EXCLUDED.linkedin_url,
         placement_organization = EXCLUDED.placement_organization,
         personal_email = COALESCE(EXCLUDED.personal_email, student_exit_clearances.personal_email),
         conversion_requested_at = NOW(),
         updated_at = NOW()`,
      [tenantId, studentUserId, dto.linkedin_url, dto.organization ?? null, dto.personal_email ?? null],
    );

    this.notify.alumniConversionRequested({
      tenantId,
      studentUserId,
      studentName: user.name,
      programName: user.program_name,
      enrollmentNo: user.enrollment_no,
    });

    return { submitted: true, verification_status: 'PENDING' };
  }

  async getClearanceStatus(tenantId: string, studentUserId: string): Promise<ClearanceStatus> {
    const rows = await this.dataSource.query<
      Array<{
        library_cleared: boolean;
        hostel_cleared: boolean;
        dept_cleared: boolean;
        finance_cleared: boolean;
      }>
    >(
      `SELECT library_cleared, hostel_cleared, dept_cleared, finance_cleared
       FROM student_exit_clearances
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, studentUserId],
    );
    const c = rows[0];
    const library = Boolean(c?.library_cleared);
    const hostel = Boolean(c?.hostel_cleared);
    const dept = Boolean(c?.dept_cleared);
    const finance = Boolean(c?.finance_cleared);
    return {
      library,
      hostel,
      dept,
      finance,
      all_cleared: library && hostel && dept && finance,
    };
  }

  /** Alumni Officer approves — runs guarded identity conversion transaction. */
  async approveAndConvert(tenantId: string, alumniId: string, adminUserId: string) {
    const rows = await this.dataSource.query<
      Array<{
        row_id: string;
        student_user_id: string;
      }>
    >(
      `SELECT COALESCE(p.alumni_id, p.alumni_profile_id) AS row_id, p.student_user_id
       FROM alumni_profiles p
       WHERE p.tenant_id = $1
         AND (COALESCE(p.alumni_id, p.alumni_profile_id) = $2 OR p.alumni_profile_id = $2)
         AND p.verification_status = 'PENDING'`,
      [tenantId, alumniId],
    );
    if (!rows[0]?.student_user_id) {
      throw new NotFoundException('Pending alumni conversion request not found');
    }

    return this.convertToAlumni(tenantId, rows[0].student_user_id, adminUserId);
  }

  /** Strict DB transaction: Student → Alumni identity shift + privilege revocation. */
  async convertToAlumni(tenantId: string, studentUserId: string, adminId: string) {
    const eligibility = await this.getConversionEligibility(tenantId, studentUserId);
    if (!eligibility.no_dues.all_cleared) {
      throw new BadRequestException('Cannot approve: Finance, Library, or Hostel no-dues are pending.');
    }
    if (!eligibility.final_semester_results_published || eligibility.active_backlogs > 0) {
      throw new BadRequestException('Cannot approve: final-semester results or backlog requirements not met.');
    }

    const clearance = await this.getClearanceStatus(tenantId, studentUserId);
    if (!clearance.all_cleared) {
      throw new BadRequestException('Cannot approve: Department clearance is still pending.');
    }

    return this.dataSource.transaction(async (manager) => {
      const users = await manager.query<
        Array<{
          user_id: string;
          name: string;
          official_email: string;
          student_profile_id: string | null;
          enrollment_no: string | null;
          graduation_year: number | null;
          program_name: string | null;
          linkedin_url: string | null;
          current_organization: string | null;
          personal_email: string | null;
        }>
      >(
        `SELECT u.user_id, u.name, u.official_email,
                sp.student_profile_id, sp.enrollment_no,
                CASE WHEN sp.batch ~ '^[0-9]{4}$' THEN CAST(sp.batch AS INT) ELSE NULL END AS graduation_year,
                (SELECT sa.program_applied FROM student_applications sa
                 WHERE sa.student_user_id = u.user_id ORDER BY sa.created_at DESC LIMIT 1) AS program_name,
                p.linkedin_url, p.current_organization, p.personal_email
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN alumni_profiles p ON p.tenant_id = $2 AND p.student_user_id = u.user_id
         WHERE u.user_id = $1 AND u.tenant_id = $2`,
        [studentUserId, tenantId],
      );
      const user = users[0];
      if (!user) throw new NotFoundException('Student not found');

      const batchYear = user.graduation_year ?? new Date().getFullYear();
      const alumniRole = await manager.query<Array<{ role_id: string }>>(
        `SELECT role_id FROM roles WHERE role_name = 'Alumni' LIMIT 1`,
      );
      if (!alumniRole[0]?.role_id) {
        throw new InternalServerErrorException('Alumni role is not configured in IAM.');
      }

      await manager.query(`UPDATE users SET role_id = $1 WHERE user_id = $2`, [
        alumniRole[0].role_id,
        studentUserId,
      ]);

      await manager.query(
        `UPDATE alumni_profiles
         SET verification_status = 'VERIFIED',
             user_id = $3,
             batch_year = COALESCE(batch_year, $4),
             graduation_year = COALESCE(graduation_year, $4),
             approved_by_user_id = $5,
             approved_at = NOW(),
             profile_updated_at = NOW()
         WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, studentUserId, studentUserId, batchYear, adminId],
      );

      await manager.query(
        `UPDATE student_exit_clearances SET alumni_converted = true, updated_at = NOW()
         WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, studentUserId],
      );

      await this.revokeStudentPrivileges(manager, tenantId, studentUserId);

      this.notify.alumniConversionApproved({
        tenantId,
        studentUserId,
        studentName: user.name,
        officialEmail: user.official_email,
      });

      return {
        success: true,
        student_user_id: studentUserId,
        verification_status: 'VERIFIED',
        official_email: user.official_email,
      };
    });
  }

  private async revokeStudentPrivileges(
    manager: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    tenantId: string,
    studentUserId: string,
  ) {
    await manager.query(
      `UPDATE student_profiles
       SET status = 'GRADUATED', alumni_conversion_flag = true, final_result = COALESCE(final_result, 'PASS')
       WHERE user_id = $1`,
      [studentUserId],
    );

    await manager.query(
      `UPDATE hostel_allocations
       SET status = 'CHECKED_OUT', updated_at = NOW()
       WHERE student_user_id = $1 AND status = 'ACTIVE'`,
      [studentUserId],
    );

    try {
      await manager.query(
        `UPDATE operations_hostel_leaves
         SET status = 'CLOSED', updated_at = NOW()
         WHERE student_user_id = $1 AND status IN ('PENDING', 'APPROVED')`,
        [studentUserId],
      );
    } catch {
      // operations_hostel_leaves may be absent in some tenants
    }
  }

  async enqueueConversion(job: AlumniConversionJob) {
    if (!job.autoVerify) {
      return this.submitConversionRequest(job.tenantId, job.studentUserId, {
        linkedin_url: job.linkedinUrl ?? '',
        organization: job.placementOrganization,
        personal_email: job.personalEmail,
      });
    }

    return this.convertToAlumni(job.tenantId, job.studentUserId, 'system');
  }

  async scanGraduatesForConversion(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT c.student_user_id
       FROM student_exit_clearances c
       WHERE c.tenant_id = $1
         AND c.library_cleared = true AND c.finance_cleared = true AND c.hostel_cleared = true
         AND c.dept_cleared = true
         AND COALESCE(c.alumni_converted, false) = false
         AND c.conversion_requested_at IS NOT NULL`,
      [tenantId],
    );
    return { pending_admin_review: rows.length };
  }

  async runConversion(job: AlumniConversionJob, approvedByUserId?: string) {
    if (job.autoVerify) {
      return this.convertToAlumni(
        job.tenantId,
        job.studentUserId,
        approvedByUserId ?? 'system',
      );
    }
    return this.submitConversionRequest(job.tenantId, job.studentUserId, {
      linkedin_url: job.linkedinUrl ?? '',
      organization: job.placementOrganization,
      personal_email: job.personalEmail,
    });
  }
}

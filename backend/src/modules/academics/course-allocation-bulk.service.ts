import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { AuthService } from '../../auth/auth.service';
import { StudentEnrollmentSyncService } from './student-enrollment-sync.service';
import { StudentMentorSyncService } from './student-mentor-sync.service';

export type CourseAllocationRowInput = {
  faculty_username: string;
  subject_fullname: string;
  subject_code: string;
  sub_type: string;
  semester: string;
  program_name: string;
  credits: number;
};

export type PreviewRow = CourseAllocationRowInput & {
  row_number: number;
  is_new_subject: boolean;
  is_unassigned: boolean;
  faculty_user_id: string | null;
  faculty_name: string | null;
  faculty_email: string | null;
  faculty_photo_url: string | null;
  existing_subject_id: number | null;
  warnings: string[];
};

export type ExecuteResult = {
  subjects_created: number;
  subjects_updated: number;
  allocations_created: number;
  courses_provisioned: number;
  workspaces_assigned: number;
  unassigned_count: number;
};

const TEMPLATE_HEADERS = [
  'faculty_username',
  'subject_fullname',
  'subject_code',
  'sub_type',
  'semester',
  'program_name',
  'credits',
] as const;

const HEADER_ALIASES: Record<string, string> = {
  faculty: 'faculty_username',
  faculty_name: 'faculty_username',
  faculty_user: 'faculty_username',
  subject: 'subject_fullname',
  subject_name: 'subject_fullname',
  subject_full_name: 'subject_fullname',
  code: 'subject_code',
  type: 'sub_type',
  subject_type: 'sub_type',
  program: 'program_name',
  credit: 'credits',
};

const NF_VALUES = new Set(['nf', 'n/f', 'no faculty', 'unassigned', '-', '']);

@Injectable()
export class CourseAllocationBulkService {
  private readonly logger = new Logger(CourseAllocationBulkService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly authService: AuthService,
    private readonly enrollmentSync: StudentEnrollmentSyncService,
    private readonly mentorSync: StudentMentorSyncService,
  ) {}

  private async syncTeachingFacultyRole(facultyUserId: string | null | undefined) {
    if (!facultyUserId) return;
    await this.authService.ensureTeachingFacultyRoleForHod(facultyUserId);
  }

  async buildTemplateBuffer(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Teaching Load');
    sheet.addRow([
      'Faculty username',
      'Subject Fullname',
      'Subject Code',
      'Sub Type',
      'Semester',
      'Program Name',
      'Credits',
    ]);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      'Naman.Raj',
      'Data Structures and Algorithms',
      'CS3001',
      'TH',
      'III-A',
      'BTECH CSE',
      3,
    ]);
    sheet.addRow([
      'NF',
      'Engineering Mathematics III',
      'MA3010',
      'TH',
      'III-B',
      'BTECH CSE',
      4,
    ]);
    sheet.columns.forEach((col) => {
      col.width = 24;
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async parseUploadFile(
    buffer: Buffer,
    filename: string,
  ): Promise<CourseAllocationRowInput[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv')) return this.parseCsv(buffer);
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return this.parseExcel(buffer);
    }
    throw new BadRequestException(
      'Only .xlsx, .xls, or .csv files are supported',
    );
  }

  validateHeaders(headers: string[]): void {
    const normalized = headers.map((h) => this.normalizeHeader(h));
    const missing = TEMPLATE_HEADERS.filter(
      (required) => !normalized.includes(required),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Expected: Faculty username, Subject Fullname, Subject Code, Sub Type, Semester, Program Name, Credits`,
      );
    }
  }

  private normalizeCourseCode(code: string): string {
    return code.trim().replace(/\s+/g, '').toUpperCase();
  }

  async buildPreview(
    tenantId: string,
    rows: CourseAllocationRowInput[],
  ): Promise<{ rows: PreviewRow[]; summary: Record<string, number> }> {
    const existingSubjects = await this.dataSource.query<
      { subject_id: number; subject_code: string }[]
    >(
      `SELECT subject_id, UPPER(REPLACE(TRIM(subject_code), ' ', '')) AS subject_code
       FROM academic_subjects WHERE deleted_at IS NULL`,
    );
    const subjectByCode = new Map(
      existingSubjects.map((s) => [s.subject_code, s.subject_id]),
    );

    const facultyRows = await this.dataSource.query<
      {
        user_id: string;
        name: string;
        official_email: string;
      }[]
    >(
      `SELECT u.user_id, u.name, u.official_email
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')`,
      [tenantId],
    );
    const facultyByUsername = this.buildFacultyUsernameIndex(facultyRows);

    const previewRows: PreviewRow[] = rows.map((row, idx) => {
      const codeKey = this.normalizeCourseCode(row.subject_code);
      const existingId = subjectByCode.get(codeKey) ?? null;
      const isNew = existingId === null;
      const isUnassigned = NF_VALUES.has(
        row.faculty_username.trim().toLowerCase(),
      );
      const warnings: string[] = [];

      let facultyUserId: string | null = null;
      let facultyName: string | null = null;
      let facultyEmail: string | null = null;

      if (!isUnassigned) {
        const match = facultyByUsername.get(
          row.faculty_username.trim().toLowerCase(),
        );
        if (match) {
          facultyUserId = match.user_id;
          facultyName = match.name;
          facultyEmail = match.official_email;
        } else {
          warnings.push(
            `Faculty "${row.faculty_username}" not found — will save as unassigned`,
          );
        }
      }

      if (!row.subject_code.trim()) {
        warnings.push('Subject code is empty');
      }
      if (!row.subject_fullname.trim()) {
        warnings.push('Subject fullname is empty');
      }

      return {
        ...row,
        row_number: idx + 2,
        is_new_subject: isNew,
        is_unassigned: isUnassigned || !facultyUserId,
        faculty_user_id: facultyUserId,
        faculty_name: facultyName,
        faculty_email: facultyEmail,
        faculty_photo_url: null,
        existing_subject_id: existingId,
        warnings,
      };
    });

    return {
      rows: previewRows,
      summary: {
        total: previewRows.length,
        new_subjects: previewRows.filter((r) => r.is_new_subject).length,
        unassigned: previewRows.filter((r) => r.is_unassigned).length,
        faculty_matched: previewRows.filter(
          (r) => !r.is_unassigned && r.faculty_user_id,
        ).length,
        warnings: previewRows.filter((r) => r.warnings.length > 0).length,
      },
    };
  }

  async executeBulkMap(
    tenantId: string,
    academicYear: string,
    rows: CourseAllocationRowInput[],
  ): Promise<ExecuteResult> {
    if (!academicYear?.trim()) {
      throw new BadRequestException('Academic year is required');
    }
    if (!rows.length) {
      throw new BadRequestException('No rows to import');
    }

    const preview = await this.buildPreview(tenantId, rows);
    const blocking = preview.rows.filter(
      (r) => !r.subject_code.trim() || !r.subject_fullname.trim(),
    );
    if (blocking.length) {
      throw new BadRequestException(
        `Row ${blocking[0].row_number}: subject code and fullname are required`,
      );
    }

    const defaultProgramId = await this.resolveDefaultProgramId();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    const result: ExecuteResult = {
      subjects_created: 0,
      subjects_updated: 0,
      allocations_created: 0,
      courses_provisioned: 0,
      workspaces_assigned: 0,
      unassigned_count: 0,
    };
    const assignedFacultyIds = new Set<string>();

    try {
      for (const row of preview.rows) {
        const subjectId = await this.upsertSubject(
          qr,
          row,
          defaultProgramId,
          result,
        );
        const courseId = await this.ensureCourse(qr, tenantId, row, result);
        const facultyId = row.is_unassigned ? null : row.faculty_user_id;

        await qr.query(
          `INSERT INTO academic_course_allocations
             (tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
           ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year)
           DO UPDATE SET
             faculty_user_id = EXCLUDED.faculty_user_id,
             course_id = EXCLUDED.course_id,
             updated_at = NOW()`,
          [
            tenantId,
            subjectId,
            row.program_name?.trim() || null,
            row.semester?.trim() || null,
            facultyId,
            academicYear.trim(),
            courseId,
          ],
        );
        result.allocations_created += 1;

        if (facultyId && courseId) {
          assignedFacultyIds.add(facultyId);
          await this.ensureFacultyTimetableSlot(
            qr,
            tenantId,
            courseId,
            facultyId,
          );
          result.workspaces_assigned += 1;
          this.notify.timetableChanged({
            tenantId,
            userId: facultyId,
            courseName: row.subject_fullname,
            changeSummary: `You have been assigned to teach ${row.subject_fullname} (${row.subject_code}) for ${academicYear}.`,
          });
        } else {
          result.unassigned_count += 1;
        }
      }

      await qr.commitTransaction();
      await Promise.all(
        [...assignedFacultyIds].map((id) => this.syncTeachingFacultyRole(id)),
      );
      await this.enrollmentSync.syncTenantStudents(
        tenantId,
        academicYear.trim(),
      );
      await this.mentorSync.syncTenantStudents(tenantId, academicYear.trim());
      return result;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error('Bulk course allocation failed — rolled back', err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  async countUnassigned(tenantId: string, hodUserId: string): Promise<number> {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return 0;
    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       INNER JOIN iam_programs p ON p.program_id = s.program_id AND p.dept_id = ANY($2::int[])
       WHERE a.tenant_id = $1
         AND a.faculty_user_id IS NULL
         AND a.status = 'ACTIVE'`,
      [tenantId, deptIds],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async listUnassignedForHod(tenantId: string, hodUserId: string) {
    const tableExists = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'academic_course_allocations'
       ) AS exists`,
    );
    if (!tableExists[0]?.exists) return { items: [], faculty: [] };

    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return { items: [], faculty: [] };
    const faculty = await this.listDepartmentFaculty(tenantId, deptIds);

    const items = await this.dataSource.query<
      {
        allocation_id: string;
        subject_code: string;
        subject_name: string;
        subject_type: string;
        credits: number;
        program_name: string;
        semester: string;
        academic_year: string;
      }[]
    >(
      `SELECT a.allocation_id,
              s.subject_code,
              s.subject_name,
              s.subject_type,
              s.credits,
              a.program_name,
              a.semester,
              a.academic_year
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       INNER JOIN iam_programs p ON p.program_id = s.program_id AND p.dept_id = ANY($2::int[])
       WHERE a.tenant_id = $1
         AND a.faculty_user_id IS NULL
         AND a.status = 'ACTIVE'
       ORDER BY a.academic_year DESC, a.program_name, a.semester, s.subject_code`,
      [tenantId, deptIds],
    );

    return { items, faculty };
  }

  async listAssignedForHod(tenantId: string, hodUserId: string) {
    const tableExists = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'academic_course_allocations'
       ) AS exists`,
    );
    if (!tableExists[0]?.exists) return { items: [], faculty: [] };

    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return { items: [], faculty: [] };

    const faculty = await this.listDepartmentFaculty(tenantId, deptIds);

    const items = await this.dataSource.query<
      {
        allocation_id: string;
        course_id: string | null;
        subject_code: string;
        subject_name: string;
        subject_type: string;
        credits: number;
        program_name: string;
        semester: string;
        academic_year: string;
        faculty_user_id: string;
        faculty_name: string;
      }[]
    >(
      `SELECT a.allocation_id,
              a.course_id,
              s.subject_code,
              s.subject_name,
              s.subject_type,
              s.credits,
              a.program_name,
              a.semester,
              a.academic_year,
              a.faculty_user_id,
              u.name AS faculty_name
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1
         AND a.faculty_user_id IS NOT NULL
         AND a.status = 'ACTIVE'
         AND u.dept_id = ANY($2::int[])
       ORDER BY a.academic_year DESC, s.subject_code ASC, a.semester ASC`,
      [tenantId, deptIds],
    );

    return { items, faculty };
  }

  async reassignFacultyForHod(
    tenantId: string,
    hodUserId: string,
    allocationId: string,
    newFacultyUserId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const allocation = await this.dataSource.query<
      {
        allocation_id: string;
        course_id: string | null;
        faculty_user_id: string;
        faculty_dept_id: number;
        subject_name: string;
        subject_code: string;
        academic_year: string;
      }[]
    >(
      `SELECT a.allocation_id, a.course_id, a.faculty_user_id, u.dept_id AS faculty_dept_id,
              s.subject_name, s.subject_code, a.academic_year
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.allocation_id = $1 AND a.tenant_id = $2 AND a.status = 'ACTIVE'`,
      [allocationId, tenantId],
    );
    if (!allocation[0]) throw new NotFoundException('Allocation not found');
    if (!deptIds.includes(Number(allocation[0].faculty_dept_id))) {
      throw new BadRequestException('This subject is outside your department scope');
    }
    if (allocation[0].faculty_user_id === newFacultyUserId) {
      throw new BadRequestException('Subject is already assigned to this faculty member');
    }

    const oldFacultyUserId = allocation[0].faculty_user_id;
    const result = await this.assignFacultyToAllocation(
      tenantId,
      hodUserId,
      allocationId,
      newFacultyUserId,
    );

    if (oldFacultyUserId) {
      this.notify.timetableChanged({
        tenantId,
        userId: oldFacultyUserId,
        courseName: allocation[0].subject_name,
        changeSummary: `${allocation[0].subject_name} (${allocation[0].subject_code}) has been reassigned to another faculty member for ${allocation[0].academic_year}.`,
      });
    }

    return result;
  }

  async assignFacultyToAllocation(
    tenantId: string,
    hodUserId: string,
    allocationId: string,
    facultyUserId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.dataSource.query<
      { user_id: string; name: string; dept_id: number }[]
    >(
      `SELECT u.user_id, u.name, u.dept_id
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')`,
      [facultyUserId, tenantId],
    );
    if (!faculty[0]) throw new NotFoundException('Faculty member not found');
    if (!deptIds.includes(faculty[0].dept_id)) {
      throw new BadRequestException(
        'Faculty member is outside your department scope',
      );
    }

    const allocation = await this.dataSource.query<
      {
        allocation_id: string;
        course_id: string | null;
        subject_name: string;
        subject_code: string;
        academic_year: string;
      }[]
    >(
      `SELECT a.allocation_id, a.course_id, s.subject_name, s.subject_code, a.academic_year
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       WHERE a.allocation_id = $1 AND a.tenant_id = $2 AND a.status = 'ACTIVE'`,
      [allocationId, tenantId],
    );
    if (!allocation[0]) throw new NotFoundException('Allocation not found');
    if (!allocation[0].course_id) {
      throw new BadRequestException(
        'Course workspace not provisioned for this allocation',
      );
    }

    await this.dataSource.query(
      `UPDATE academic_course_allocations
       SET faculty_user_id = $1, updated_at = NOW()
       WHERE allocation_id = $2 AND tenant_id = $3`,
      [facultyUserId, allocationId, tenantId],
    );

    await this.ensureFacultyTimetableSlotDirect(
      tenantId,
      allocation[0].course_id,
      facultyUserId,
    );

    this.notify.timetableChanged({
      tenantId,
      userId: facultyUserId,
      courseName: allocation[0].subject_name,
      changeSummary: `You have been assigned to teach ${allocation[0].subject_name} (${allocation[0].subject_code}) for ${allocation[0].academic_year}.`,
    });

    await this.syncTeachingFacultyRole(facultyUserId);

    return {
      success: true,
      allocation_id: allocationId,
      faculty_user_id: facultyUserId,
    };
  }

  async listAllAllocations(tenantId: string) {
    const items = await this.dataSource.query(
      `SELECT a.allocation_id,
              s.subject_code,
              s.subject_name,
              s.subject_type,
              s.credits,
              a.program_name,
              a.semester,
              a.academic_year,
              a.faculty_user_id,
              u.name AS faculty_name,
              u.official_email AS faculty_email
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       LEFT JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1
         AND a.status = 'ACTIVE'
       ORDER BY a.academic_year DESC, a.program_name, a.semester, s.subject_code`,
      [tenantId],
    );

    const faculty = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
       ORDER BY u.name`,
      [tenantId],
    );

    return { items, faculty };
  }

  async updateAllocationFaculty(
    tenantId: string,
    allocationId: string,
    newFacultyUserId: string | null,
  ) {
    const allocation = await this.dataSource.query(
      `SELECT a.allocation_id, a.course_id, a.faculty_user_id, s.subject_name, s.subject_code, a.academic_year
       FROM academic_course_allocations a
       INNER JOIN academic_subjects s ON s.subject_id = a.subject_id
       WHERE a.allocation_id = $1 AND a.tenant_id = $2 AND a.status = 'ACTIVE'`,
      [allocationId, tenantId],
    );
    if (!allocation[0]) throw new NotFoundException('Allocation not found');

    const courseId = allocation[0].course_id;
    const oldFacultyUserId = allocation[0].faculty_user_id;

    await this.dataSource.query(
      `UPDATE academic_course_allocations
       SET faculty_user_id = $1, updated_at = NOW()
       WHERE allocation_id = $2 AND tenant_id = $3`,
      [newFacultyUserId, allocationId, tenantId],
    );

    if (courseId) {
      if (oldFacultyUserId) {
        await this.dataSource.query(
          `DELETE FROM academic_timetables
           WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3`,
          [tenantId, courseId, oldFacultyUserId],
        );
      }

      if (newFacultyUserId) {
        await this.ensureFacultyTimetableSlotDirect(
          tenantId,
          courseId,
          newFacultyUserId,
        );

        this.notify.timetableChanged({
          tenantId,
          userId: newFacultyUserId,
          courseName: allocation[0].subject_name,
          changeSummary: `You have been assigned to teach ${allocation[0].subject_name} (${allocation[0].subject_code}) for ${allocation[0].academic_year}.`,
        });
      }
    }

    await this.syncTeachingFacultyRole(newFacultyUserId);

    return {
      success: true,
      allocation_id: allocationId,
      faculty_user_id: newFacultyUserId,
    };
  }

  async deleteAllocation(tenantId: string, allocationId: string) {
    const allocation = await this.dataSource.query(
      `SELECT a.allocation_id, a.course_id, a.faculty_user_id
       FROM academic_course_allocations a
       WHERE a.allocation_id = $1 AND a.tenant_id = $2`,
      [allocationId, tenantId],
    );
    if (!allocation[0]) throw new NotFoundException('Allocation not found');

    const { course_id, faculty_user_id } = allocation[0];

    if (course_id && faculty_user_id) {
      await this.dataSource.query(
        `DELETE FROM academic_timetables
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3`,
        [tenantId, course_id, faculty_user_id],
      );
    }

    await this.dataSource.query(
      `DELETE FROM academic_course_allocations
       WHERE allocation_id = $1 AND tenant_id = $2`,
      [allocationId, tenantId],
    );

    return { success: true };
  }

  private async upsertSubject(
    qr: QueryRunner,
    row: PreviewRow,
    defaultProgramId: number,
    result: ExecuteResult,
  ): Promise<number> {
    const code = this.normalizeCourseCode(row.subject_code);
    const shortname =
      row.subject_fullname
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .slice(0, 50) || code;
    const subType = this.normalizeSubType(row.sub_type);

    const inserted = (await qr.query(
      `INSERT INTO academic_subjects
         (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (subject_code) DO UPDATE SET
         subject_name = EXCLUDED.subject_name,
         subject_shortname = COALESCE(EXCLUDED.subject_shortname, academic_subjects.subject_shortname),
         credits = EXCLUDED.credits,
         subject_type = EXCLUDED.subject_type,
         is_active = true,
         updated_at = NOW()
       RETURNING subject_id`,
      [
        code,
        row.subject_fullname.trim(),
        shortname,
        defaultProgramId,
        row.credits || 0,
        subType,
      ],
    )) as { subject_id: number }[];

    if (row.is_new_subject) result.subjects_created += 1;
    else result.subjects_updated += 1;
    return inserted[0].subject_id;
  }

  private async ensureCourse(
    qr: QueryRunner,
    tenantId: string,
    row: PreviewRow,
    result: ExecuteResult,
  ): Promise<string> {
    const code = this.normalizeCourseCode(row.subject_code);
    const courses = (await qr.query(
      `INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (tenant_id, course_code) DO UPDATE SET
         course_name = EXCLUDED.course_name,
         credits = EXCLUDED.credits
       RETURNING course_id`,
      [tenantId, code, row.subject_fullname.trim(), row.credits || 0],
    )) as { course_id: string }[];
    result.courses_provisioned += 1;
    return courses[0].course_id;
  }

  private scheduleSlotForFaculty(slotIndex: number): {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  } {
    const dayOfWeek = (slotIndex % 6) + 1;
    const hour = 9 + Math.floor(slotIndex / 6);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      dayOfWeek,
      startTime: `${pad(hour)}:00`,
      endTime: `${pad(hour + 1)}:00`,
    };
  }

  private async ensureFacultyTimetableSlot(
    qr: QueryRunner,
    tenantId: string,
    courseId: string,
    facultyUserId: string,
  ) {
    await this.ensureFacultyTimetableSlotWithQuery(
      (sql, params) => qr.query(sql, params),
      tenantId,
      courseId,
      facultyUserId,
    );
  }

  private async ensureFacultyTimetableSlotDirect(
    tenantId: string,
    courseId: string,
    facultyUserId: string,
  ) {
    await this.ensureFacultyTimetableSlotWithQuery(
      (sql, params) => this.dataSource.query(sql, params),
      tenantId,
      courseId,
      facultyUserId,
    );
  }

  private async ensureFacultyTimetableSlotWithQuery(
    query: (sql: string, params: unknown[]) => Promise<unknown>,
    tenantId: string,
    courseId: string,
    facultyUserId: string,
  ) {
    const updated = (await query(
      `UPDATE academic_timetables
          SET faculty_user_id = $3
        WHERE tenant_id = $1
          AND course_id = $2
          AND deleted_at IS NULL
        RETURNING timetable_id`,
      [tenantId, courseId, facultyUserId],
    )) as Array<{ timetable_id: string }>;
    if (updated.length > 0) return;

    const counted = (await query(
      `SELECT COUNT(*)::int AS cnt
       FROM academic_timetables
       WHERE tenant_id = $1
         AND faculty_user_id = $2
         AND deleted_at IS NULL`,
      [tenantId, facultyUserId],
    )) as Array<{ cnt: number }>;
    const { dayOfWeek, startTime, endTime } = this.scheduleSlotForFaculty(
      counted[0]?.cnt ?? 0,
    );

    await query(
      `INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, courseId, dayOfWeek, startTime, endTime, facultyUserId],
    );
  }

  private async resolveDefaultProgramId(): Promise<number> {
    const rows = await this.dataSource.query<{ program_id: number }[]>(
      `SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1`,
    );
    return rows[0]?.program_id ?? 1;
  }

  private async resolveHodDepartmentIds(hodUserId: string): Promise<number[]> {
    const directDepartments = await this.dataSource.query<
      { dept_id: number }[]
    >(`SELECT dept_id FROM departments WHERE hod_user_id = $1`, [hodUserId]);
    const hod = await this.dataSource.query<{ dept_id: number | null }[]>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    return Array.from(
      new Set<number>([
        ...directDepartments.map((row) => Number(row.dept_id)),
        ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
      ]),
    );
  }

  private async listDepartmentFaculty(tenantId: string, deptIds: number[]) {
    if (!deptIds.length) return [];
    return this.dataSource.query<
      { user_id: string; name: string; email: string }[]
    >(
      `SELECT u.user_id, u.name, u.official_email AS email
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
       ORDER BY u.name`,
      [tenantId, deptIds],
    );
  }

  private buildFacultyUsernameIndex(
    faculty: { user_id: string; name: string; official_email: string }[],
  ) {
    const map = new Map<
      string,
      { user_id: string; name: string; official_email: string }
    >();
    for (const f of faculty) {
      const emailLocal = f.official_email.split('@')[0]?.toLowerCase() ?? '';
      if (emailLocal) map.set(emailLocal, f);
      const dottedName = f.name.trim().toLowerCase().replace(/\s+/g, '.');
      if (dottedName) map.set(dottedName, f);
      map.set(f.name.trim().toLowerCase(), f);
    }
    return map;
  }

  private normalizeSubType(raw: string): string {
    const v = raw.trim().toUpperCase();
    const map: Record<string, string> = {
      TH: 'THEORY',
      THEORY: 'THEORY',
      LAB: 'LAB',
      SKILL: 'SKILL',
      PROJECT: 'PROJECT',
    };
    return map[v] ?? (v || 'THEORY');
  }

  private normalizeHeader(raw: string): string {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    return HEADER_ALIASES[key] ?? key;
  }

  private normalizeRow(
    raw: Record<string, string>,
    lineNumber: number,
  ): CourseAllocationRowInput {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = raw[k];
        if (v !== undefined && v !== '') return v.trim();
      }
      return '';
    };
    const creditsRaw = get('credits');
    const credits = creditsRaw ? Number(creditsRaw) : 0;
    if (creditsRaw && Number.isNaN(credits)) {
      throw new BadRequestException(
        `Row ${lineNumber}: credits must be a number`,
      );
    }
    const row: CourseAllocationRowInput = {
      faculty_username: get('faculty_username'),
      subject_fullname: get('subject_fullname'),
      subject_code: get('subject_code'),
      sub_type: get('sub_type') || 'TH',
      semester: get('semester'),
      program_name: get('program_name'),
      credits,
    };
    if (!row.faculty_username && !row.subject_code && !row.subject_fullname) {
      throw new BadRequestException(`Row ${lineNumber}: empty row`);
    }
    return row;
  }

  private parseCsv(buffer: Buffer): CourseAllocationRowInput[] {
    const text = buffer.toString('utf8').trim();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must include a header row and at least one data row',
      );
    }
    const headers = lines[0].split(',').map((h) => this.normalizeHeader(h));
    this.validateHeaders(headers);
    return lines.slice(1).map((line, idx) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return this.normalizeRow(row, idx + 2);
    });
  }

  private async parseExcel(
    buffer: Buffer,
  ): Promise<CourseAllocationRowInput[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('Excel file has no worksheets');

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col - 1] = this.normalizeHeader(String(cell.value ?? ''));
    });
    this.validateHeaders(headers);

    const rows: CourseAllocationRowInput[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers[col - 1];
        if (!key) return;
        record[key] = String(cell.value ?? '').trim();
      });
      if (Object.values(record).every((v) => !v)) return;
      rows.push(this.normalizeRow(record, rowNumber));
    });
    if (!rows.length) {
      throw new BadRequestException('Excel file has no data rows');
    }
    return rows;
  }
}

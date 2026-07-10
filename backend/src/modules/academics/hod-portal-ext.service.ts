import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import { AcademicsService } from './academics.service';

type AuditRow = {
  facultyName: string;
  facultyId?: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  pptsUploaded: number;
  totalClasses?: number;
  classesConducted?: number;
  attendanceMarked: number;
  attendanceStatusLabel?: string;
  marksUploaded: { ga: boolean; wt: boolean; labs: boolean; theory: boolean };
  marksStatus: string;
};

@Injectable()
export class HodPortalExtService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly academics: AcademicsService,
  ) {}

  private async resolveHodDepartmentIds(hodUserId: string): Promise<number[]> {
    const rows = await this.db.query<Array<{ dept_id: number }>>(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1 AND deleted_at IS NULL
       UNION
       SELECT dept_id FROM users WHERE user_id = $1 AND dept_id IS NOT NULL`,
      [hodUserId],
    );
    return [...new Set(rows.map((r) => Number(r.dept_id)).filter(Boolean))];
  }

  private async assertHodDeptAccess(hodUserId: string, deptId: number) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.includes(deptId)) {
      throw new ForbiddenException('Not authorized for this department');
    }
    return deptIds;
  }

  async exportFacultyAuditExcel(
    tenantId: string,
    hodUserId: string,
    facultyUserId?: string,
  ): Promise<Buffer> {
    const rows = (await this.academics.getHodFacultyAudit(
      tenantId,
      hodUserId,
    )) as AuditRow[];
    const filtered = facultyUserId
      ? rows.filter((r) => r.facultyId === facultyUserId)
      : rows;

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Faculty Audit');
    sheet.addRow([
      'Faculty',
      'Semester',
      'Subject Code',
      'Subject Name',
      'PPTs Uploaded',
      'Classes Conducted',
      'Total Classes',
      'Attendance %',
      'Today Status',
      'GA',
      'WT',
      'LAB',
      'Theory',
      'Marks Status',
    ]);
    sheet.getRow(1).font = { bold: true };

    for (const r of filtered) {
      sheet.addRow([
        r.facultyName,
        r.semester,
        r.subjectCode,
        r.subjectName,
        r.pptsUploaded,
        r.classesConducted ?? 0,
        r.totalClasses ?? 0,
        r.attendanceMarked,
        r.attendanceStatusLabel ?? '',
        r.marksUploaded.ga ? 'Yes' : 'No',
        r.marksUploaded.wt ? 'Yes' : 'No',
        r.marksUploaded.labs ? 'Yes' : 'No',
        r.marksUploaded.theory ? 'Yes' : 'No',
        r.marksStatus,
      ]);
    }

    sheet.columns.forEach((col) => {
      col.width = 16;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async listCompiledResultsCourses(
    tenantId: string,
    hodUserId: string,
    semester: number,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return [];

    return this.db.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name, e.semester
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       JOIN users u ON u.user_id = e.student_user_id
       WHERE e.tenant_id = $1
         AND e.semester = $2
         AND u.dept_id = ANY($3::int[])
       ORDER BY c.course_code`,
      [tenantId, semester, deptIds],
    );
  }

  async getCompiledResultsTable(
    tenantId: string,
    hodUserId: string,
    semester: number,
    courseId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return { course: null, students: [], exam_types: [] };

    const courseRows = await this.db.query(
      `SELECT course_id, course_code, course_name FROM academic_courses
       WHERE tenant_id = $1 AND course_id = $2 LIMIT 1`,
      [tenantId, courseId],
    );
    if (!courseRows[0]) throw new NotFoundException('Course not found');

    const students = await this.db.query(
      `SELECT e.student_user_id, u.name AS student_name,
              sp.enrollment_number AS enrollment_no, u.official_email AS email
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.tenant_id = $1 AND e.semester = $2 AND e.course_id = $3
         AND u.dept_id = ANY($4::int[])
       ORDER BY u.name`,
      [tenantId, semester, courseId, deptIds],
    );

    const marks = await this.db.query(
      `SELECT student_user_id, exam_type, marks_obtained
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2`,
      [tenantId, courseId],
    );

    const examTypes = [
      ...new Set(marks.map((m: { exam_type: string }) => m.exam_type)),
    ].sort() as string[];

    const marksMap = new Map<string, Record<string, number | string>>();
    for (const m of marks) {
      const key = m.student_user_id as string;
      if (!marksMap.has(key)) marksMap.set(key, {});
      marksMap.get(key)![m.exam_type as string] = Number(m.marks_obtained) || 0;
    }

    const studentRows = students.map((s: Record<string, string>) => {
      const stuMarks = marksMap.get(s.student_user_id) ?? {};
      const numeric = Object.values(stuMarks).filter(
        (v) => typeof v === 'number',
      ) as number[];
      const total = numeric.length
        ? numeric.reduce((a, b) => a + b, 0)
        : null;
      return {
        student_user_id: s.student_user_id,
        student_name: s.student_name,
        enrollment_no: s.enrollment_no ?? '',
        email: s.email ?? '',
        marks: stuMarks,
        total_marks: total,
      };
    });

    return {
      course: courseRows[0],
      semester,
      exam_types: examTypes,
      students: studentRows,
    };
  }

  async exportCompiledResultsExcel(
    tenantId: string,
    hodUserId: string,
    semester: number,
    courseId: string,
    studentUserId?: string,
  ): Promise<Buffer> {
    const table = await this.getCompiledResultsTable(
      tenantId,
      hodUserId,
      semester,
      courseId,
    );
    let students = table.students;
    if (studentUserId) {
      students = students.filter(
        (s: { student_user_id: string }) => s.student_user_id === studentUserId,
      );
    }

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Compiled Results');
    const headers = [
      'Student Name',
      'Enrollment No',
      'Email',
      ...table.exam_types,
      'Total',
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    for (const s of students) {
      sheet.addRow([
        s.student_name,
        s.enrollment_no,
        s.email,
        ...table.exam_types.map(
          (t: string) => (s.marks as Record<string, number | string>)[t] ?? '—',
        ),
        s.total_marks ?? '—',
      ]);
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async getPlacementSettings(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return { dept_id: null, coordinator: null, faculty_options: [] };

    const deptId = deptIds[0];
    const settings = await this.db.query(
      `SELECT s.coordinator_user_id, u.name AS coordinator_name, u.official_email AS coordinator_email
       FROM hod_dept_placement_settings s
       LEFT JOIN users u ON u.user_id = s.coordinator_user_id
       WHERE s.tenant_id = $1 AND s.dept_id = $2`,
      [tenantId, deptId],
    );

    const faculty = await this.academics.listHodFacultyRoster(tenantId, hodUserId);

    return {
      dept_id: deptId,
      coordinator: settings[0]
        ? {
            user_id: settings[0].coordinator_user_id,
            name: settings[0].coordinator_name,
            email: settings[0].coordinator_email,
          }
        : null,
      faculty_options: faculty.map((f: { user_id: string; name: string; email: string }) => ({
        user_id: f.user_id,
        name: f.name,
        email: f.email,
      })),
    };
  }

  async setPlacementCoordinator(
    tenantId: string,
    hodUserId: string,
    coordinatorUserId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) throw new BadRequestException('No department assigned');
    const deptId = deptIds[0];

    const faculty = await this.db.query(
      `SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2 AND dept_id = $3`,
      [coordinatorUserId, tenantId, deptId],
    );
    if (!faculty[0]) throw new BadRequestException('Faculty must belong to your department');

    await this.db.query(
      `INSERT INTO hod_dept_placement_settings (tenant_id, dept_id, coordinator_user_id, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, dept_id)
       DO UPDATE SET coordinator_user_id = EXCLUDED.coordinator_user_id,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [tenantId, deptId, coordinatorUserId, hodUserId],
    );

    return this.getPlacementSettings(tenantId, hodUserId);
  }

  async listPlacementDrives(tenantId: string, actorUserId: string, role: string) {
    let deptIds: number[];
    if (role === 'HOD' || role === 'SuperAdmin') {
      deptIds = await this.resolveHodDepartmentIds(actorUserId);
    } else {
      const coord = await this.db.query(
        `SELECT dept_id FROM hod_dept_placement_settings
         WHERE tenant_id = $1 AND coordinator_user_id = $2`,
        [tenantId, actorUserId],
      );
      if (!coord[0]) return [];
      deptIds = [Number(coord[0].dept_id)];
    }
    if (!deptIds.length) return [];

    const drives = await this.db.query(
      `SELECT d.*,
              (SELECT COUNT(*)::int FROM hod_dept_placement_responses r WHERE r.drive_id = d.drive_id) AS response_count
       FROM hod_dept_placement_drives d
       WHERE d.tenant_id = $1 AND d.dept_id = ANY($2::int[]) AND d.deleted_at IS NULL
       ORDER BY d.drive_date DESC NULLS LAST, d.created_at DESC`,
      [tenantId, deptIds],
    );
    return drives;
  }

  async createPlacementDrive(
    tenantId: string,
    actorUserId: string,
    role: string,
    dto: {
      company_name: string;
      job_role?: string;
      drive_date?: string;
      drive_time?: string;
      semester?: number;
      form_url?: string;
      form_type?: string;
      description?: string;
    },
  ) {
    let deptId: number;
    if (role === 'HOD' || role === 'SuperAdmin') {
      const deptIds = await this.resolveHodDepartmentIds(actorUserId);
      if (!deptIds.length) throw new BadRequestException('No department');
      deptId = deptIds[0];
    } else {
      const coord = await this.db.query(
        `SELECT dept_id FROM hod_dept_placement_settings
         WHERE tenant_id = $1 AND coordinator_user_id = $2`,
        [tenantId, actorUserId],
      );
      if (!coord[0]) throw new ForbiddenException('You are not the placement coordinator');
      deptId = Number(coord[0].dept_id);
    }

    const rows = await this.db.query(
      `INSERT INTO hod_dept_placement_drives
         (tenant_id, dept_id, company_name, job_role, drive_date, drive_time, semester,
          form_url, form_type, description, created_by, google_form_webhook_secret)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        tenantId,
        deptId,
        dto.company_name,
        dto.job_role ?? null,
        dto.drive_date ?? null,
        dto.drive_time ?? null,
        dto.semester ?? null,
        dto.form_url ?? null,
        dto.form_type ?? (dto.form_url?.trim() ? 'GOOGLE_FORM' : 'INTERNAL'),
        dto.description ?? null,
        actorUserId,
        dto.form_url?.trim() ? this.newWebhookSecret() : null,
      ],
    );
    return rows[0];
  }

  async updatePlacementDrive(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    dto: Record<string, unknown>,
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);

    const nextFormUrl =
      dto.form_url !== undefined && dto.form_url !== null
        ? String(dto.form_url).trim() || null
        : undefined;

    const rows = await this.db.query(
      `UPDATE hod_dept_placement_drives SET
         company_name = COALESCE($3, company_name),
         job_role = COALESCE($4, job_role),
         drive_date = COALESCE($5, drive_date),
         drive_time = COALESCE($6, drive_time),
         semester = COALESCE($7, semester),
         form_url = COALESCE($8, form_url),
         form_type = COALESCE($9, form_type),
         status = COALESCE($10, status),
         description = COALESCE($11, description),
         updated_at = NOW()
       WHERE drive_id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        driveId,
        tenantId,
        dto.company_name ?? null,
        dto.job_role ?? null,
        dto.drive_date ?? null,
        dto.drive_time ?? null,
        dto.semester ?? null,
        nextFormUrl ?? null,
        dto.form_type ?? null,
        dto.status ?? null,
        dto.description ?? null,
      ],
    );
    const updated = rows[0] as { form_url?: string | null };
    if (nextFormUrl === null || (updated.form_url ?? '').trim() === '') {
      await this.db.query(
        `UPDATE hod_dept_placement_drives
         SET google_form_webhook_secret = NULL
         WHERE drive_id = $1 AND tenant_id = $2`,
        [driveId, tenantId],
      );
      return { ...updated, google_form_webhook_secret: null };
    }
    if ((updated.form_url ?? '').trim()) {
      return this.ensureDriveWebhookSecret(tenantId, driveId);
    }
    return updated;
  }

  async deletePlacementDrive(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);
    await this.db.query(
      `UPDATE hod_dept_placement_drives SET deleted_at = NOW() WHERE drive_id = $1`,
      [driveId],
    );
    return { success: true };
  }

  async listDriveResponses(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    submittedDate?: string,
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);
    const dateFilter =
      submittedDate && /^\d{4}-\d{2}-\d{2}$/.test(submittedDate) ? submittedDate : null;
    return this.db.query(
      `SELECT response_id, student_user_id, student_name, student_email, enrollment_no, phone, submitted_at, response_json
       FROM hod_dept_placement_responses
       WHERE drive_id = $1 AND tenant_id = $2
         AND ($3::date IS NULL OR (submitted_at AT TIME ZONE 'Asia/Kolkata')::date = $3::date)
       ORDER BY student_name ASC, submitted_at DESC`,
      [driveId, tenantId, dateFilter],
    );
  }

  async searchPlacementStudents(
    tenantId: string,
    actorUserId: string,
    role: string,
    query: string,
    currentDriveId?: string,
  ) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];

    const deptIds = await this.resolvePlacementDeptIds(tenantId, actorUserId, role);
    if (!deptIds.length) return [];

    const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const rows = await this.db.query<
      Array<{
        student_user_id: string | null;
        student_name: string;
        student_email: string | null;
        enrollment_no: string | null;
        phone: string | null;
        drive_id: string;
        company_name: string;
        job_role: string | null;
        drive_date: string | null;
        submitted_at: string;
      }>
    >(
      `SELECT r.student_user_id, r.student_name, r.student_email, r.enrollment_no, r.phone,
              d.drive_id, d.company_name, d.job_role, d.drive_date, r.submitted_at
       FROM hod_dept_placement_responses r
       INNER JOIN hod_dept_placement_drives d ON d.drive_id = r.drive_id
       WHERE r.tenant_id = $1
         AND d.dept_id = ANY($2::int[])
         AND d.deleted_at IS NULL
         AND (
           r.student_name ILIKE $3 ESCAPE '\\'
           OR COALESCE(r.student_email, '') ILIKE $3 ESCAPE '\\'
           OR COALESCE(r.enrollment_no, '') ILIKE $3 ESCAPE '\\'
           OR COALESCE(r.phone, '') ILIKE $3 ESCAPE '\\'
         )
       ORDER BY r.student_name ASC, r.submitted_at DESC`,
      [tenantId, deptIds, pattern],
    );

    if (!rows.length) return [];

    const grouped = new Map<
      string,
      {
        student_user_id: string | null;
        student_name: string;
        student_email: string | null;
        enrollment_no: string | null;
        phone: string | null;
        drives: Array<{
          drive_id: string;
          company_name: string;
          job_role: string | null;
          drive_date: string | null;
          submitted_at: string;
        }>;
      }
    >();

    for (const row of rows) {
      const key = row.student_user_id
        ? `uid:${row.student_user_id}`
        : row.student_email
          ? `email:${row.student_email.toLowerCase()}`
          : row.enrollment_no
            ? `enr:${row.enrollment_no}`
            : `name:${row.student_name.toLowerCase()}`;

      const existing = grouped.get(key);
      const driveEntry = {
        drive_id: row.drive_id,
        company_name: row.company_name,
        job_role: row.job_role,
        drive_date: row.drive_date,
        submitted_at: row.submitted_at,
      };

      if (!existing) {
        grouped.set(key, {
          student_user_id: row.student_user_id,
          student_name: row.student_name,
          student_email: row.student_email,
          enrollment_no: row.enrollment_no,
          phone: row.phone,
          drives: [driveEntry],
        });
        continue;
      }

      if (!existing.drives.some((d) => d.drive_id === row.drive_id)) {
        existing.drives.push(driveEntry);
      }
      if (!existing.student_user_id && row.student_user_id) {
        existing.student_user_id = row.student_user_id;
      }
    }

    return Array.from(grouped.entries()).map(([student_key, student]) => ({
      student_key,
      student_user_id: student.student_user_id,
      student_name: student.student_name,
      student_email: student.student_email,
      enrollment_no: student.enrollment_no,
      phone: student.phone,
      registered_on_current_drive: currentDriveId
        ? student.drives.some((d) => d.drive_id === currentDriveId)
        : false,
      drives: student.drives,
    }));
  }

  async addManualDriveResponse(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    dto: {
      student_user_id?: string;
      student_name?: string;
      student_email?: string;
      enrollment_no?: string;
      phone?: string;
      notes?: string;
    },
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);

    let studentUserId: string | null = dto.student_user_id?.trim() || null;
    let name = dto.student_name?.trim() || '';
    let email = dto.student_email?.trim() || null;
    let enrollmentNo = dto.enrollment_no?.trim() || null;
    let phone = dto.phone?.trim() || null;

    if (studentUserId) {
      const student = await this.db.query(
        `SELECT u.user_id, u.name, u.official_email, u.dept_id,
                sp.enrollment_number, sp.phone
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.user_id = $1 AND u.tenant_id = $2`,
        [studentUserId, tenantId],
      );
      if (!student[0] || Number(student[0].dept_id) !== Number(drive.dept_id)) {
        throw new BadRequestException('Student is not in this department');
      }
      name = name || student[0].name;
      email = email || student[0].official_email;
      enrollmentNo = enrollmentNo || student[0].enrollment_number;
      phone = phone || student[0].phone;

      const existing = await this.db.query(
        `SELECT response_id FROM hod_dept_placement_responses
         WHERE drive_id = $1 AND student_user_id = $2`,
        [driveId, studentUserId],
      );
      if (existing[0]) throw new BadRequestException('Student is already registered for this drive');
    } else {
      if (!name) throw new BadRequestException('Student name is required');
      if (email || enrollmentNo) {
        const existing = await this.db.query(
          `SELECT response_id FROM hod_dept_placement_responses
           WHERE drive_id = $1
             AND (
               ($2::text IS NOT NULL AND student_email IS NOT NULL AND LOWER(student_email) = LOWER($2))
               OR ($3::text IS NOT NULL AND enrollment_no IS NOT NULL AND enrollment_no = $3)
             )
           LIMIT 1`,
          [driveId, email, enrollmentNo],
        );
        if (existing[0]) throw new BadRequestException('Student is already registered for this drive');
      }
    }

    const rows = await this.db.query(
      `INSERT INTO hod_dept_placement_responses
         (drive_id, tenant_id, student_user_id, student_name, student_email, enrollment_no, phone, response_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING response_id, student_user_id, student_name, student_email, enrollment_no, phone, submitted_at, response_json`,
      [
        driveId,
        tenantId,
        studentUserId,
        name,
        email,
        enrollmentNo,
        phone,
        JSON.stringify({
          source: 'MANUAL_COORDINATOR',
          notes: dto.notes?.trim() || null,
          added_by: actorUserId,
        }),
      ],
    );
    return rows[0];
  }

  async submitDriveResponse(
    tenantId: string,
    studentUserId: string,
    driveId: string,
    dto: {
      student_name?: string;
      student_email?: string;
      enrollment_no?: string;
      phone?: string;
      response_json?: Record<string, unknown>;
    },
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    const student = await this.db.query(
      `SELECT u.name, u.official_email, u.dept_id, sp.enrollment_number
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [studentUserId, tenantId],
    );
    if (!student[0] || Number(student[0].dept_id) !== Number(drive.dept_id)) {
      throw new ForbiddenException(
        'This drive is for another department. Sign in with a student account from your department.',
      );
    }

    const existing = await this.db.query(
      `SELECT response_id FROM hod_dept_placement_responses
       WHERE drive_id = $1 AND student_user_id = $2`,
      [driveId, studentUserId],
    );
    if (existing[0]) throw new BadRequestException('You already registered for this drive');

    const formUrl = drive.form_url;
    if (formUrl?.trim()) {
      const attested = dto.response_json?.google_form_attested === true;
      if (!attested) {
        throw new BadRequestException(
          'Open the Google Form, submit it, then confirm registration with the attestation checkbox.',
        );
      }
    }

    const rows = await this.db.query(
      `INSERT INTO hod_dept_placement_responses
         (drive_id, tenant_id, student_user_id, student_name, student_email, enrollment_no, phone, response_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        driveId,
        tenantId,
        studentUserId,
        dto.student_name ?? student[0].name,
        dto.student_email ?? student[0].official_email,
        dto.enrollment_no ?? student[0].enrollment_number,
        dto.phone ?? null,
        JSON.stringify(dto.response_json ?? { source: 'PORTAL' }),
      ],
    );
    return rows[0];
  }

  async listStudentPlacementDrives(tenantId: string, studentUserId: string) {
    const student = await this.db.query(
      `SELECT dept_id FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId],
    );
    if (!student[0]?.dept_id) return [];

    const rows = await this.db.query(
      `SELECT d.*,
              r.submitted_at AS registered_at,
              (r.response_id IS NOT NULL) AS registered,
              (d.form_url IS NOT NULL AND TRIM(d.form_url) <> '' AND d.google_form_webhook_secret IS NOT NULL) AS google_form_auto_sync
       FROM hod_dept_placement_drives d
       LEFT JOIN hod_dept_placement_responses r
         ON r.drive_id = d.drive_id AND r.student_user_id = $3
       WHERE d.tenant_id = $1 AND d.dept_id = $2
         AND d.deleted_at IS NULL AND d.status = 'UPCOMING'
       ORDER BY d.drive_date ASC NULLS LAST`,
      [tenantId, student[0].dept_id, studentUserId],
    );
    return rows.map((row: Record<string, unknown>) => ({
      ...row,
      registered: row.registered === true || row.registered === 't',
      google_form_auto_sync:
        row.google_form_auto_sync === true || row.google_form_auto_sync === 't',
    }));
  }

  private newWebhookSecret() {
    return randomBytes(24).toString('hex');
  }

  private async ensureDriveWebhookSecret(tenantId: string, driveId: string) {
    const rows = await this.db.query(
      `UPDATE hod_dept_placement_drives
       SET google_form_webhook_secret = COALESCE(
         google_form_webhook_secret,
         $3
       )
       WHERE drive_id = $1 AND tenant_id = $2
         AND form_url IS NOT NULL AND TRIM(form_url) <> ''
       RETURNING *`,
      [driveId, tenantId, this.newWebhookSecret()],
    );
    if (!rows[0]) throw new NotFoundException('Drive not found');
    return rows[0];
  }

  private pickFormField(fields: Record<string, string>, aliases: string[]) {
    for (const alias of aliases) {
      if (fields[alias]?.trim()) return fields[alias].trim();
    }
    const normalized = Object.entries(fields).map(([key, value]) => ({
      key: key.toLowerCase(),
      value: value?.trim() ?? '',
    }));
    for (const alias of aliases) {
      const needle = alias.toLowerCase();
      const hit = normalized.find((f) => f.key === needle || f.key.includes(needle));
      if (hit?.value) return hit.value;
    }
    return null;
  }

  async getGoogleFormSyncSetup(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    webhookBaseUrl: string,
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);
    if (!(drive as { form_url?: string | null }).form_url?.trim()) {
      throw new BadRequestException('This drive has no Google Form URL');
    }
    const ready = await this.ensureDriveWebhookSecret(tenantId, driveId);
    const secret = String(ready.google_form_webhook_secret ?? '');
    const webhookUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/api/academics/placement/google-form/webhook`;
    return {
      drive_id: driveId,
      webhook_url: webhookUrl,
      webhook_secret: secret,
      setup_complete: Boolean(secret),
    };
  }

  async regenerateGoogleFormWebhookSecret(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    webhookBaseUrl: string,
  ) {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);
    if (!(drive as { form_url?: string | null }).form_url?.trim()) {
      throw new BadRequestException('This drive has no Google Form URL');
    }
    const rows = await this.db.query(
      `UPDATE hod_dept_placement_drives
       SET google_form_webhook_secret = $3, updated_at = NOW()
       WHERE drive_id = $1 AND tenant_id = $2
       RETURNING *`,
      [driveId, tenantId, this.newWebhookSecret()],
    );
    const secret = String(rows[0].google_form_webhook_secret ?? '');
    const webhookUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/api/academics/placement/google-form/webhook`;
    return {
      drive_id: driveId,
      webhook_url: webhookUrl,
      webhook_secret: secret,
      setup_complete: Boolean(secret),
    };
  }

  async handleGoogleFormWebhook(dto: {
    drive_id: string;
    secret: string;
    student_name?: string;
    student_email?: string;
    enrollment_no?: string;
    phone?: string;
    google_response_id?: string;
    fields?: Record<string, string>;
  }) {
    const driveId = dto.drive_id?.trim();
    const secret = dto.secret?.trim();
    if (!driveId || !secret) {
      throw new BadRequestException('drive_id and secret are required');
    }

    const driveRows = await this.db.query(
      `SELECT * FROM hod_dept_placement_drives
       WHERE drive_id = $1 AND deleted_at IS NULL`,
      [driveId],
    );
    const drive = driveRows[0] as {
      tenant_id: string;
      dept_id: number;
      google_form_webhook_secret?: string | null;
      form_url?: string | null;
    } | undefined;
    if (!drive?.form_url?.trim()) {
      throw new NotFoundException('Drive not found or Google Form not configured');
    }
    if (drive.google_form_webhook_secret !== secret) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    const fields = dto.fields ?? {};
    const studentName =
      dto.student_name?.trim() ||
      this.pickFormField(fields, ['Student Name', 'Name', 'Full Name', 'student name']) ||
      null;
    if (!studentName) {
      throw new BadRequestException('Could not detect student name from form submission');
    }
    const studentEmail =
      dto.student_email?.trim() ||
      this.pickFormField(fields, ['Email', 'College Email', 'Official Email', 'email']) ||
      null;
    const enrollmentNo =
      dto.enrollment_no?.trim() ||
      this.pickFormField(fields, ['Enrollment No', 'Enrollment Number', 'Roll No', 'Roll Number']) ||
      null;
    const phone =
      dto.phone?.trim() ||
      this.pickFormField(fields, ['Phone', 'Mobile', 'Contact', 'Phone Number']) ||
      null;
    const googleResponseId = dto.google_response_id?.trim() || null;

    if (googleResponseId) {
      const dup = await this.db.query(
        `SELECT response_id FROM hod_dept_placement_responses
         WHERE drive_id = $1 AND response_json->>'google_response_id' = $2
         LIMIT 1`,
        [driveId, googleResponseId],
      );
      if (dup[0]) return { success: true, duplicate: true, response_id: dup[0].response_id };
    }

    if (studentEmail || enrollmentNo) {
      const dup = await this.db.query(
        `SELECT response_id FROM hod_dept_placement_responses
         WHERE drive_id = $1
           AND (
             ($2::text IS NOT NULL AND student_email IS NOT NULL AND LOWER(student_email) = LOWER($2))
             OR ($3::text IS NOT NULL AND enrollment_no IS NOT NULL AND enrollment_no = $3)
           )
         LIMIT 1`,
        [driveId, studentEmail, enrollmentNo],
      );
      if (dup[0]) return { success: true, duplicate: true, response_id: dup[0].response_id };
    }

    let studentUserId: string | null = null;
    if (studentEmail || enrollmentNo) {
      const student = await this.db.query(
        `SELECT u.user_id
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.tenant_id = $1
           AND (
             ($2::text IS NOT NULL AND LOWER(u.official_email) = LOWER($2))
             OR ($3::text IS NOT NULL AND sp.enrollment_number = $3)
           )
         LIMIT 1`,
        [drive.tenant_id, studentEmail, enrollmentNo],
      );
      studentUserId = student[0]?.user_id ?? null;
    }

    const rows = await this.db.query(
      `INSERT INTO hod_dept_placement_responses
         (drive_id, tenant_id, student_user_id, student_name, student_email, enrollment_no, phone, response_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING response_id, student_name, submitted_at`,
      [
        driveId,
        drive.tenant_id,
        studentUserId,
        studentName,
        studentEmail,
        enrollmentNo,
        phone,
        JSON.stringify({
          source: 'GOOGLE_FORM_WEBHOOK',
          google_response_id: googleResponseId,
          fields,
        }),
      ],
    );
    return { success: true, duplicate: false, response: rows[0] };
  }

  async isPlacementCoordinator(tenantId: string, userId: string) {
    const rows = await this.db.query(
      `SELECT dept_id FROM hod_dept_placement_settings
       WHERE tenant_id = $1 AND coordinator_user_id = $2`,
      [tenantId, userId],
    );
    return { is_coordinator: !!rows[0], dept_id: rows[0]?.dept_id ?? null };
  }

  private async resolvePlacementDeptIds(
    tenantId: string,
    actorUserId: string,
    role: string,
  ): Promise<number[]> {
    if (role === 'HOD' || role === 'SuperAdmin') {
      return this.resolveHodDepartmentIds(actorUserId);
    }
    const coord = await this.isPlacementCoordinator(tenantId, actorUserId);
    if (!coord.is_coordinator || coord.dept_id == null) {
      throw new ForbiddenException('Not authorized for placement exports');
    }
    return [Number(coord.dept_id)];
  }

  private formatRegistrationSource(responseJson: unknown): string {
    try {
      const parsed =
        typeof responseJson === 'string' ? JSON.parse(responseJson) : responseJson;
      const source = (parsed as { source?: string })?.source ?? 'UNKNOWN';
      if (source === 'GOOGLE_FORM_CONFIRMED') return 'Google Form + Portal confirm';
      if (source === 'GOOGLE_FORM_WEBHOOK') return 'Google Form (auto-sync)';
      if (source === 'PORTAL') return 'Portal only';
      if (source === 'MANUAL_COORDINATOR') return 'Manual (coordinator)';
      return source;
    } catch {
      return '—';
    }
  }

  private async buildRegistrationWorkbook(
    driveMeta: {
      company_name: string;
      job_role?: string | null;
      drive_date?: string | Date | null;
      semester?: number | null;
    } | null,
    rows: Array<{
      company_name?: string;
      job_role?: string | null;
      drive_date?: string | Date | null;
      semester?: number | null;
      student_name: string;
      student_email?: string | null;
      enrollment_no?: string | null;
      phone?: string | null;
      submitted_at: string | Date;
      response_json?: unknown;
    }>,
    allDrives: boolean,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(allDrives ? 'All Registrations' : 'Registrations');
    let headerRow = 1;

    if (driveMeta && !allDrives) {
      sheet.mergeCells('A1:F1');
      sheet.getCell('A1').value = `${driveMeta.company_name} — ${driveMeta.job_role ?? 'Placement Drive'}`;
      sheet.getCell('A1').font = { bold: true, size: 14 };
      sheet.getCell('A2').value = `Drive date: ${
        driveMeta.drive_date
          ? String(driveMeta.drive_date).slice(0, 10)
          : 'TBD'
      } · Sem ${driveMeta.semester ?? '—'}`;
      headerRow = 4;
    } else if (allDrives) {
      sheet.mergeCells('A1:J1');
      sheet.getCell('A1').value = 'Department placement registrations — all drives';
      sheet.getCell('A1').font = { bold: true, size: 14 };
      headerRow = 3;
    }

    const headers = allDrives
      ? [
          'Company',
          'Job Role',
          'Drive Date',
          'Semester',
          'Student Name',
          'Email',
          'Enrollment No',
          'Phone',
          'Submitted At',
          'Source',
        ]
      : ['Student Name', 'Email', 'Enrollment No', 'Phone', 'Submitted At', 'Source'];

    const header = sheet.getRow(headerRow);
    headers.forEach((label, index) => {
      header.getCell(index + 1).value = label;
    });
    header.font = { bold: true };

    if (rows.length === 0) {
      const emptyColSpan = allDrives ? 10 : 6;
      sheet.mergeCells(headerRow + 1, 1, headerRow + 1, emptyColSpan);
      sheet.getCell(headerRow + 1, 1).value = 'No student registrations recorded yet.';
    }

    for (const row of rows) {
      const submitted =
        row.submitted_at instanceof Date
          ? row.submitted_at.toISOString()
          : String(row.submitted_at);
      const source = this.formatRegistrationSource(row.response_json);
      if (allDrives) {
        sheet.addRow([
          row.company_name ?? '',
          row.job_role ?? '',
          row.drive_date ? String(row.drive_date).slice(0, 10) : '',
          row.semester ?? '',
          row.student_name,
          row.student_email ?? '',
          row.enrollment_no ?? '',
          row.phone ?? '',
          submitted,
          source,
        ]);
      } else {
        sheet.addRow([
          row.student_name,
          row.student_email ?? '',
          row.enrollment_no ?? '',
          row.phone ?? '',
          submitted,
          source,
        ]);
      }
    }

    sheet.columns.forEach((col) => {
      col.width = 18;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportPlacementDriveRegistrationsExcel(
    tenantId: string,
    actorUserId: string,
    role: string,
    driveId: string,
    responseId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const drive = await this.getDriveOrThrow(tenantId, driveId);
    await this.assertDriveAccess(tenantId, actorUserId, role, drive);

    const rows = await this.db.query<
      Array<{
        response_id: string;
        student_name: string;
        student_email: string | null;
        enrollment_no: string | null;
        phone: string | null;
        submitted_at: string;
        response_json: unknown;
      }>
    >(
      `SELECT response_id, student_name, student_email, enrollment_no, phone, submitted_at, response_json
       FROM hod_dept_placement_responses
       WHERE drive_id = $1 AND tenant_id = $2
       ORDER BY submitted_at DESC`,
      [driveId, tenantId],
    );

    const filtered = responseId
      ? rows.filter((r) => r.response_id === responseId)
      : rows;
    if (responseId && !filtered.length) {
      throw new NotFoundException('Registration not found for this student');
    }

    const buffer = await this.buildRegistrationWorkbook(
      {
        company_name: drive.company_name,
        job_role: drive.job_role,
        drive_date: drive.drive_date,
        semester: drive.semester,
      },
      filtered,
      false,
    );

    const companySlug = String(drive.company_name)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const filename = responseId
      ? `placement-${companySlug}-student.xlsx`
      : `placement-${companySlug}-all-students.xlsx`;

    return { buffer, filename };
  }

  async exportAllPlacementRegistrationsExcel(
    tenantId: string,
    actorUserId: string,
    role: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const deptIds = await this.resolvePlacementDeptIds(tenantId, actorUserId, role);
    if (!deptIds.length) throw new BadRequestException('No department linked to your account');

    const rows = await this.db.query(
      `SELECT d.company_name, d.job_role, d.drive_date, d.semester,
              r.student_name, r.student_email, r.enrollment_no, r.phone,
              r.submitted_at, r.response_json
       FROM hod_dept_placement_responses r
       INNER JOIN hod_dept_placement_drives d ON d.drive_id = r.drive_id
       WHERE r.tenant_id = $1 AND d.dept_id = ANY($2::int[]) AND d.deleted_at IS NULL
       ORDER BY d.drive_date DESC NULLS LAST, d.company_name ASC, r.submitted_at DESC`,
      [tenantId, deptIds],
    );

    const buffer = await this.buildRegistrationWorkbook(null, rows, true);
    return { buffer, filename: 'placement-all-drives-registrations.xlsx' };
  }

  private async getDriveOrThrow(tenantId: string, driveId: string) {
    const rows = await this.db.query(
      `SELECT * FROM hod_dept_placement_drives
       WHERE drive_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [driveId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Drive not found');
    return rows[0] as {
      dept_id: number;
      created_by: string;
      company_name: string;
      job_role?: string | null;
      drive_date?: string | null;
      semester?: number | null;
      form_url?: string | null;
      google_form_webhook_secret?: string | null;
    };
  }

  private async assertDriveAccess(
    tenantId: string,
    actorUserId: string,
    role: string,
    drive: { dept_id: number; created_by: string },
  ) {
    if (role === 'HOD' || role === 'SuperAdmin') {
      await this.assertHodDeptAccess(actorUserId, drive.dept_id);
      return;
    }
    const coord = await this.isPlacementCoordinator(tenantId, actorUserId);
    if (!coord.is_coordinator || Number(coord.dept_id) !== Number(drive.dept_id)) {
      throw new ForbiddenException('Not authorized to manage this drive');
    }
  }
}

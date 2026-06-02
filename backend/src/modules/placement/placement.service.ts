import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PlacementService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
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
        dto.hr_name ?? 'HR',
        dto.hr_email ?? 'hr@company.com',
        dto.hr_mobile ?? null,
        dto.industry ?? null,
        JSON.stringify(dto.hr_contacts ?? []),
        JSON.stringify(dto.company_profile ?? {}),
      ],
    );
  }

  drives(tenantId?: string) {
    return this.db.query(
      `SELECT d.*, c.company_name
       FROM placement_drives d
       JOIN placement_companies c ON c.company_id = d.company_id
       WHERE d.tenant_id = $1
       ORDER BY d.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createDrive(tenantId: string, dto: Record<string, unknown>) {
    const rows = await this.db.query(
      `INSERT INTO placement_drives
         (tenant_id, company_id, job_profile, package_details_lpa, min_cgpa, max_backlogs, drive_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        this.tenant(tenantId),
        dto.company_id,
        dto.job_profile,
        dto.package_details_lpa ?? null,
        dto.min_cgpa ?? 6.0,
        dto.max_backlogs ?? 0,
        dto.drive_date ?? null,
      ],
    );
    const drive = rows[0] as { job_profile: string };
    const company = await this.db.query<Array<{ company_name: string }>>(
      `SELECT company_name FROM placement_companies WHERE company_id = $1`,
      [dto.company_id],
    );
    const students = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student'`,
      [this.tenant(tenantId)],
    );
    for (const student of students) {
      this.notify.jobPosted({
        tenantId: this.tenant(tenantId),
        userId: student.user_id,
        companyName: company[0]?.company_name ?? 'Company',
        roleTitle: String(drive.job_profile ?? 'Role'),
      });
    }
    return rows;
  }

  async checkEligibility(studentUserId: string, driveId: string) {
    const drives = await this.db.query(`SELECT * FROM placement_drives WHERE drive_id = $1`, [driveId]);
    const drive = drives[0] as { min_cgpa: string; max_backlogs: number } | undefined;
    if (!drive) throw new NotFoundException('Drive not found');

    const stats = await this.db.query(
      `SELECT
         COALESCE(AVG(e.grade_points), 0) AS cgpa,
         COUNT(*) FILTER (WHERE e.grade_points = 0 OR UPPER(e.grade) IN ('F', 'FA', 'FAIL'))::int AS backlogs
       FROM student_course_enrollments e
       WHERE e.student_user_id = $1`,
      [studentUserId],
    );
    const row = stats[0] as { cgpa: string; backlogs: number };
    const cgpa = Number(row.cgpa);
    const backlogs = Number(row.backlogs);
    const eligible = cgpa >= Number(drive.min_cgpa) && backlogs <= Number(drive.max_backlogs);

    return {
      eligible,
      cgpa: Number(cgpa.toFixed(2)),
      backlogs,
      min_cgpa: Number(drive.min_cgpa),
      max_backlogs: drive.max_backlogs,
      reason: eligible
        ? null
        : `Requires CGPA ≥ ${drive.min_cgpa} and backlogs ≤ ${drive.max_backlogs}`,
    };
  }

  async applyToDrive(tenantId: string, studentUserId: string, driveId: string) {
    const check = await this.checkEligibility(studentUserId, driveId);
    if (!check.eligible) {
      throw new BadRequestException(check.reason ?? 'Not eligible for this drive');
    }
    return this.db.query(
      `INSERT INTO placement_drive_applications (tenant_id, drive_id, student_user_id, eligibility_status)
       VALUES ($1, $2, $3, 'ELIGIBLE')
       ON CONFLICT (drive_id, student_user_id) DO UPDATE SET eligibility_status = 'ELIGIBLE'
       RETURNING *`,
      [this.tenant(tenantId), driveId, studentUserId],
    );
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
    const user = await this.db.query(`SELECT name, official_email FROM users WHERE user_id = $1`, [studentUserId]);
    const resume = await this.db.query(`SELECT * FROM student_resume_profiles WHERE student_user_id = $1`, [studentUserId]);
    const u = user[0] as { name: string; official_email: string };
    const r = resume[0] as { skills: string[]; projects: unknown[] } | undefined;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Suresh Gyan Vihar University', { x: 50, y: 780, size: 14, font: bold, color: rgb(0.03, 0.14, 0.29) });
    page.drawText(u?.name ?? 'Student', { x: 50, y: 750, size: 18, font: bold });
    page.drawText(u?.official_email ?? '', { x: 50, y: 730, size: 10, font });
    page.drawText('Skills: ' + ((r?.skills ?? []).join(', ') || '—'), { x: 50, y: 700, size: 10, font });
    const bytes = await pdf.save();
    const rel = path.join(tenantId, 'resumes', `${studentUserId}.pdf`);
    const abs = path.join(process.cwd(), 'uploads', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    const url = `/uploads/${rel}`.replace(/\\/g, '/');
    await this.db.query(
      `INSERT INTO student_resume_profiles (tenant_id, student_user_id, skills, resume_pdf_path)
       VALUES ($1, $2, '{}', $3)
       ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET resume_pdf_path = EXCLUDED.resume_pdf_path`,
      [this.tenant(tenantId), studentUserId, url],
    );
    return { resume_pdf_path: url };
  }
}

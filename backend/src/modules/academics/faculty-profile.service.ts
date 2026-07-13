import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { mkdirSync, createWriteStream, createReadStream } from 'fs';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { HrAdminService } from '../hr/hr-admin.service';
import {
  openDocumentReadStream,
  resolveDocumentDiskPath,
} from '../hr/utils/document-file-path.util';
import { ObjectStorageService } from '../../storage/object-storage.service';

const DEGREE_LEVELS = ['UG', 'PG', 'PhD', 'Post-Doc'] as const;

@Injectable()
export class FacultyProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: HrFieldEncryptionService,
    private readonly hrAdmin: HrAdminService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async getProfile(tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.phone, u.onboarding_profile,
              r.role_name AS role, d.dept_name AS department,
              p.profile_id, p.employee_id, p.designation, p.joining_date,
              p.orcid_id, p.scopus_id, p.google_scholar_url,
              p.total_experience_years, p.industry_experience_years,
              p.ifsc_code, p.pf_uan,
              p.pan_encrypted, p.aadhaar_encrypted, p.bank_account_encrypted
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Faculty profile not found');
    const row = rows[0];
    const onboarding = (row.onboarding_profile ?? {}) as Record<
      string,
      unknown
    >;

    const qualifications = await this.listQualifications(tenantId, userId);
    const responsibilities = await this.listResponsibilities(
      tenantId,
      userId,
      row.role,
      row.department,
    );
    const researchSummary = await this.getResearchSummary(tenantId, userId);
    const workload = await this.getWorkload(tenantId, userId);
    const menteeCount = await this.countActiveMentees(userId);
    const apiScore = await this.getCurrentApiScore(tenantId, userId);
    const photoPath = await this.getProfilePhotoPath(tenantId, userId);
    const displayTitle = this.inferHonorific(qualifications, row.designation);
    const teachingExperience = this.resolveTeachingExperience(row);

    const pendingBank = await this.dataSource.query(
      `SELECT request_id, status, created_at FROM hr_profile_change_requests
       WHERE tenant_id = $1 AND user_id = $2 AND change_type = 'BANK_DETAILS'
         AND status = 'PENDING_APPROVAL'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, userId],
    );

    return {
      user_id: row.user_id,
      name: row.name,
      display_name: displayTitle ? `${displayTitle} ${row.name}` : row.name,
      honorific: displayTitle,
      email: row.email,
      phone:
        row.phone ?? (onboarding.staff_mobile as string | undefined) ?? null,
      role: row.role,
      department: row.department,
      employee_id: row.employee_id,
      designation: row.designation ?? row.role,
      joining_date: row.joining_date,
      profile_photo_url: photoPath
        ? '/api/academics/faculty/profile/photo'
        : null,
      total_teaching_experience_years: teachingExperience,
      industry_experience_years:
        row.industry_experience_years != null
          ? Number(row.industry_experience_years)
          : Number(onboarding.industry_experience_years ?? 0),
      api_score: apiScore,
      active_mentees: menteeCount,
      responsibilities,
      personal: {
        date_of_birth: onboarding.date_of_birth
          ? String(onboarding.date_of_birth).slice(0, 10)
          : null,
        blood_group: (onboarding.blood_group as string | undefined) ?? null,
        gender: (onboarding.gender as string | undefined) ?? null,
        emergency_contact_name:
          (onboarding.emergency_contact_name as string | undefined) ?? null,
        emergency_contact_phone:
          (onboarding.emergency_contact_phone as string | undefined) ?? null,
        permanent_address:
          (onboarding.permanent_address as string | undefined) ?? null,
        current_address:
          (onboarding.current_address as string | undefined) ?? null,
      },
      kyc: {
        pan_masked: this.crypto.maskPan(this.crypto.decrypt(row.pan_encrypted)),
        aadhaar_masked: this.crypto.maskAadhaar(
          this.crypto.decrypt(row.aadhaar_encrypted),
        ),
        bank_masked: this.crypto.maskBank(
          this.crypto.decrypt(row.bank_account_encrypted),
        ),
        ifsc_code: row.ifsc_code,
        pf_uan: row.pf_uan,
      },
      research_identifiers: {
        orcid_id: row.orcid_id,
        scopus_id: row.scopus_id,
        google_scholar_url: row.google_scholar_url,
      },
      research_summary: researchSummary,
      qualifications,
      workload,
      bank_change_pending: pendingBank[0] ?? null,
      compliance: {
        needs_academic_profile: this.needsAcademicProfile(row, qualifications),
      },
    };
  }

  async getComplianceStatus(tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT p.orcid_id FROM hr_employee_profiles p
       WHERE p.tenant_id = $1 AND p.user_id = $2`,
      [tenantId, userId],
    );
    const qualifications = await this.listQualifications(tenantId, userId);
    const needs = this.needsAcademicProfile(rows[0] ?? {}, qualifications);
    return {
      needs_academic_profile: needs,
      message: needs
        ? 'Please complete your Academic Profile for IQAC compliance.'
        : null,
    };
  }

  async updateProfile(
    tenantId: string,
    userId: string,
    dto: {
      phone?: string | null;
      emergency_contact_name?: string;
      emergency_contact_phone?: string;
      permanent_address?: string;
      current_address?: string;
      orcid_id?: string;
      scopus_id?: string;
      google_scholar_url?: string;
      total_experience_years?: number;
      industry_experience_years?: number;
    },
  ) {
    if (dto.phone !== undefined) {
      const phone = dto.phone?.trim() || null;
      if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
        throw new BadRequestException('Enter a valid phone number');
      }
      await this.dataSource.query(
        `UPDATE users SET phone = $1, updated_at = NOW() WHERE user_id = $2 AND tenant_id = $3`,
        [phone, userId, tenantId],
      );
    }

    const onboardingPatch: Record<string, unknown> = {};
    if (dto.emergency_contact_name !== undefined)
      onboardingPatch.emergency_contact_name = dto.emergency_contact_name;
    if (dto.emergency_contact_phone !== undefined)
      onboardingPatch.emergency_contact_phone = dto.emergency_contact_phone;
    if (dto.permanent_address !== undefined)
      onboardingPatch.permanent_address = dto.permanent_address;
    if (dto.current_address !== undefined)
      onboardingPatch.current_address = dto.current_address;
    if (dto.industry_experience_years !== undefined) {
      onboardingPatch.industry_experience_years = dto.industry_experience_years;
    }

    if (Object.keys(onboardingPatch).length) {
      await this.dataSource.query(
        `UPDATE users
         SET onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE user_id = $2 AND tenant_id = $3`,
        [JSON.stringify(onboardingPatch), userId, tenantId],
      );
    }

    const profileUpdates: string[] = [];
    const profileValues: unknown[] = [tenantId, userId];
    let idx = 3;

    if (dto.orcid_id !== undefined) {
      profileUpdates.push(`orcid_id = $${idx++}`);
      profileValues.push(dto.orcid_id || null);
    }
    if (dto.scopus_id !== undefined) {
      profileUpdates.push(`scopus_id = $${idx++}`);
      profileValues.push(dto.scopus_id || null);
    }
    if (dto.google_scholar_url !== undefined) {
      profileUpdates.push(`google_scholar_url = $${idx++}`);
      profileValues.push(dto.google_scholar_url || null);
    }
    if (dto.total_experience_years !== undefined) {
      profileUpdates.push(`total_experience_years = $${idx++}`);
      profileValues.push(dto.total_experience_years);
    }
    if (dto.industry_experience_years !== undefined) {
      profileUpdates.push(`industry_experience_years = $${idx++}`);
      profileValues.push(dto.industry_experience_years);
    }

    if (profileUpdates.length) {
      profileUpdates.push('updated_at = NOW()');
      await this.dataSource.query(
        `UPDATE hr_employee_profiles SET ${profileUpdates.join(', ')}
         WHERE tenant_id = $1 AND user_id = $2`,
        profileValues,
      );
    }

    return this.getProfile(tenantId, userId);
  }

  async revealKyc(tenantId: string, userId: string, password: string) {
    const [row] = await this.dataSource.query<
      Array<{ password_hash: string | null }>
    >(`SELECT password_hash FROM users WHERE user_id = $1 AND tenant_id = $2`, [
      userId,
      tenantId,
    ]);
    if (!row?.password_hash)
      throw new UnauthorizedException('Password verification failed');
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid password');

    await this.dataSource.query(
      `INSERT INTO hr_kyc_reveal_audit (tenant_id, target_user_id, revealed_by_user_id, field_group)
       VALUES ($1, $2, $2, 'ALL')`,
      [tenantId, userId],
    );

    const profile = await this.getProfile(tenantId, userId);
    const sensitive = await this.dataSource.query(
      `SELECT pan_encrypted, aadhaar_encrypted, bank_account_encrypted, ifsc_code, pf_uan
       FROM hr_employee_profiles WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    const s = sensitive[0] ?? {};
    return {
      ...profile,
      kyc_revealed: {
        pan: this.crypto.decrypt(s.pan_encrypted),
        aadhaar: this.crypto.decrypt(s.aadhaar_encrypted),
        bank_account: this.crypto.decrypt(s.bank_account_encrypted),
        ifsc_code: s.ifsc_code,
        pf_uan: s.pf_uan,
      },
    };
  }

  async submitBankChangeRequest(
    tenantId: string,
    userId: string,
    dto: { bank_account_no: string; ifsc_code: string; bank_name?: string },
  ) {
    if (!dto.bank_account_no?.trim() || !dto.ifsc_code?.trim()) {
      throw new BadRequestException(
        'Bank account number and IFSC are required',
      );
    }

    const existing = await this.dataSource.query(
      `SELECT request_id FROM hr_profile_change_requests
       WHERE tenant_id = $1 AND user_id = $2 AND change_type = 'BANK_DETAILS'
         AND status = 'PENDING_APPROVAL'`,
      [tenantId, userId],
    );
    if (existing.length) {
      throw new BadRequestException(
        'A bank details change request is already pending HR approval',
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hr_profile_change_requests (tenant_id, user_id, change_type, payload, status)
       VALUES ($1, $2, 'BANK_DETAILS', $3::jsonb, 'PENDING_APPROVAL')
       RETURNING *`,
      [
        tenantId,
        userId,
        JSON.stringify({
          bank_account_no: dto.bank_account_no.trim(),
          ifsc_code: dto.ifsc_code.trim().toUpperCase(),
          bank_name: dto.bank_name?.trim() ?? null,
        }),
      ],
    );
    return rows[0];
  }

  async listQualifications(tenantId: string, userId: string) {
    return this.dataSource.query(
      `SELECT qual_id, degree_level, degree_name, university, passing_year, specialization,
              document_proof_url, created_at
       FROM hr_academic_qualifications
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY passing_year DESC, created_at DESC`,
      [tenantId, userId],
    );
  }

  async addQualification(
    tenantId: string,
    userId: string,
    dto: {
      degree_level?: string;
      degree_name?: string;
      university: string;
      passing_year: number;
      specialization?: string;
      document_proof_url?: string;
    },
  ) {
    if (!dto.university?.trim())
      throw new BadRequestException('University is required');
    const year = Number(dto.passing_year);
    if (!year || year < 1950 || year > new Date().getFullYear() + 1) {
      throw new BadRequestException('Valid passing year is required');
    }
    if (
      dto.degree_level &&
      !DEGREE_LEVELS.includes(
        dto.degree_level as (typeof DEGREE_LEVELS)[number],
      )
    ) {
      throw new BadRequestException(
        `degree_level must be one of: ${DEGREE_LEVELS.join(', ')}`,
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hr_academic_qualifications (
         tenant_id, user_id, degree_level, degree_name, university, passing_year,
         specialization, document_proof_url, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
      [
        tenantId,
        userId,
        dto.degree_level ?? null,
        dto.degree_name ?? null,
        dto.university.trim(),
        year,
        dto.specialization?.trim() ?? null,
        dto.document_proof_url ?? null,
      ],
    );
    return rows[0];
  }

  async saveQualificationDocument(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const uploadDir = join(
      process.cwd(),
      'uploads',
      'faculty-qualifications',
      tenantId,
      userId,
    );
    mkdirSync(uploadDir, { recursive: true });
    const safeName =
      `${Date.now()}${extname(file.originalname) || '.pdf'}`.replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );
    const fullPath = join(uploadDir, safeName);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      stream.end(file.buffer);
    });
    return fullPath;
  }

  private async listResponsibilities(
    tenantId: string,
    userId: string,
    role: string | null,
    department: string | null,
  ) {
    const stored = await this.dataSource.query(
      `SELECT responsibility_id, title, description
       FROM hr_employee_responsibilities
       WHERE tenant_id = $1 AND user_id = $2 AND is_active = true
       ORDER BY created_at ASC`,
      [tenantId, userId],
    );

    const derived: Array<{ title: string; source: string }> = [];
    if (role === 'HOD' && department) {
      derived.push({ title: `HOD of ${department}`, source: 'role' });
    }

    const warden = await this.dataSource.query(
      `SELECT h.hostel_name
       FROM operations_hostel_warden_assignments wa
       INNER JOIN operations_hostels h ON h.hostel_id = wa.hostel_id
       WHERE wa.user_id = $1
       LIMIT 3`,
      [userId],
    );
    for (const w of warden) {
      derived.push({ title: `Warden (${w.hostel_name})`, source: 'hostel' });
    }

    const titles = new Set<string>();
    const merged: Array<{
      title: string;
      description?: string | null;
      source?: string;
    }> = [];
    for (const d of derived) {
      if (!titles.has(d.title)) {
        titles.add(d.title);
        merged.push({ title: d.title, source: d.source });
      }
    }
    for (const s of stored) {
      if (!titles.has(s.title)) {
        titles.add(s.title);
        merged.push({
          title: s.title,
          description: s.description,
          source: 'assigned',
        });
      }
    }
    return merged;
  }

  private async getResearchSummary(tenantId: string, userId: string) {
    const logs = await this.dataSource.query(
      `SELECT publication_type, indexing_type
       FROM faculty_research_logs
       WHERE tenant_id = $1 AND faculty_user_id = $2`,
      [tenantId, userId],
    );

    let scopusPapers = 0;
    let patents = 0;
    let conferencePapers = 0;
    let books = 0;
    for (const log of logs) {
      if (log.publication_type === 'PATENT') patents += 1;
      if (log.publication_type === 'JOURNAL' && log.indexing_type === 'SCOPUS')
        scopusPapers += 1;
      if (log.publication_type === 'CONFERENCE') conferencePapers += 1;
      if (
        log.publication_type === 'BOOK' ||
        log.publication_type === 'BOOK_CHAPTER'
      )
        books += 1;
    }

    const projects = await this.dataSource.query(
      `SELECT COALESCE(SUM(grant_amount), 0)::numeric AS total
       FROM faculty_research_projects
       WHERE tenant_id = $1 AND principal_investigator_user_id = $2`,
      [tenantId, userId],
    );

    const grants = await this.dataSource.query(
      `SELECT COALESCE(SUM(sanctioned_amount), 0)::numeric AS total
       FROM research_grants
       WHERE tenant_id = $1 AND principal_investigator_id = $2`,
      [tenantId, userId],
    );

    const totalGrantsInr =
      Number(projects[0]?.total ?? 0) + Number(grants[0]?.total ?? 0);

    return {
      total_scopus_papers: scopusPapers,
      total_patents: patents,
      total_conference_papers: conferencePapers,
      total_books: books,
      total_publications: logs.length,
      total_grants_inr: totalGrantsInr,
      total_grants_display: this.formatIndianCurrency(totalGrantsInr),
    };
  }

  private async getWorkload(tenantId: string, userId: string) {
    const courses = await this.dataSource.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.credits,
              CASE WHEN c.course_name ILIKE '%lab%' OR c.course_code ILIKE '%L%' THEN 'Lab' ELSE 'Theory' END AS session_type
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.tenant_id = $1 AND t.faculty_user_id = $2 AND t.deleted_at IS NULL
       ORDER BY c.course_code`,
      [tenantId, userId],
    );

    const hoursRow = await this.dataSource.query(
      `SELECT COALESCE(SUM(
         EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
       ), 0)::numeric AS weekly_hours
       FROM academic_timetables
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND deleted_at IS NULL`,
      [tenantId, userId],
    );

    const projectGuides = await this.dataSource.query(
      `SELECT g.guide_id, g.project_title, g.program AS project_type, u.name AS student_name
       FROM faculty_project_guides g
       INNER JOIN project_guide_students pgs ON pgs.guide_id = g.guide_id
       INNER JOIN users u ON u.user_id = pgs.student_user_id
       WHERE g.tenant_id = $1 AND g.faculty_user_id = $2
       ORDER BY g.created_at DESC`,
      [tenantId, userId],
    );

    const phdScholars = await this.dataSource.query(
      `SELECT rs.scholar_id, rs.current_phase, u.name AS scholar_name
       FROM research_scholars rs
       LEFT JOIN users u ON u.user_id = rs.student_user_id
       WHERE rs.tenant_id = $1 AND rs.guide_user_id = $2`,
      [tenantId, userId],
    );

    return {
      courses,
      weekly_teaching_hours: Number(hoursRow[0]?.weekly_hours ?? 0),
      project_guides_count: projectGuides.length,
      project_guides: projectGuides,
      phd_scholars_count: phdScholars.length,
      phd_scholars: phdScholars,
    };
  }

  private async countActiveMentees(proctorUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM academic_mentorships
       WHERE proctor_user_id = $1 AND is_active = true`,
      [proctorUserId],
    );
    return rows[0]?.count ?? 0;
  }

  private async getCurrentApiScore(tenantId: string, userId: string) {
    const year = new Date().getFullYear();
    const rows = await this.dataSource.query(
      `SELECT auto_api_score FROM hr_employee_appraisals
       WHERE tenant_id = $1 AND user_id = $2 AND appraisal_year = $3`,
      [tenantId, userId, year],
    );
    if (rows[0]?.auto_api_score != null) return Number(rows[0].auto_api_score);
    const calculated = await this.hrAdmin.calculateApiScore(
      tenantId,
      userId,
      year,
    );
    return Number(calculated?.auto_api_score ?? 0);
  }

  async uploadProfilePhoto(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('No photo uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Profile photo must be JPG, PNG, or WEBP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Profile photo must be 5MB or smaller');
    }

    const filePath = await this.saveProfilePhotoFile(tenantId, userId, file);

    await this.dataSource.query(
      `INSERT INTO staff_onboarding_docs (tenant_id, staff_user_id, doc_type, file_path, status)
       VALUES ($1, $2, 'PHOTO', $3, 'APPROVED')
       ON CONFLICT (staff_user_id, doc_type) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         status = 'APPROVED',
         uploaded_at = NOW()`,
      [tenantId, userId, filePath],
    );

    await this.dataSource.query(
      `UPDATE users
       SET onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [JSON.stringify({ profile_photo_url: filePath }), userId, tenantId],
    );

    return this.getProfile(tenantId, userId);
  }

  async openProfilePhotoStream(tenantId: string, userId: string) {
    const filePath = await this.getProfilePhotoPath(tenantId, userId);
    if (!filePath) throw new NotFoundException('Profile photo not found');

    const stream = await openDocumentReadStream(filePath, this.objectStorage);
    if (stream) return { stream, filePath };

    const diskPath = resolveDocumentDiskPath(filePath);
    if (!diskPath) throw new NotFoundException('Profile photo file missing');
    return { stream: createReadStream(diskPath), filePath: diskPath };
  }

  async saveProfilePhotoFile(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const ext = extname(file.originalname) || '.jpg';
    const uniqueName = `${uuidv4()}${ext}`;

    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return stored.url ?? stored.key;
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const targetDir = join(
      process.cwd(),
      uploadPath,
      tenantId,
      String(year),
      month,
    );
    mkdirSync(targetDir, { recursive: true });
    const fullPath = join(targetDir, uniqueName);
    await new Promise<void>((resolvePromise, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('finish', () => resolvePromise());
      stream.on('error', reject);
      stream.end(file.buffer);
    });
    return fullPath;
  }

  private async getProfilePhotoPath(tenantId: string, userId: string) {
    const [doc] = await this.dataSource.query<Array<{ file_path: string }>>(
      `SELECT file_path FROM staff_onboarding_docs
       WHERE tenant_id = $1 AND staff_user_id = $2 AND doc_type = 'PHOTO' AND file_path IS NOT NULL
       ORDER BY uploaded_at DESC LIMIT 1`,
      [tenantId, userId],
    );
    if (doc?.file_path) return doc.file_path;

    const [user] = await this.dataSource.query<
      Array<{ onboarding_profile: Record<string, unknown> | null }>
    >(
      `SELECT onboarding_profile FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    const fromProfile = user?.onboarding_profile?.profile_photo_url;
    return typeof fromProfile === 'string' && fromProfile.trim()
      ? fromProfile
      : null;
  }

  private async getProfilePhoto(tenantId: string, userId: string) {
    return this.getProfilePhotoPath(tenantId, userId);
  }

  private inferHonorific(
    qualifications: Array<{ degree_level?: string | null }>,
    designation: string | null,
  ) {
    const levels = qualifications.map((q) =>
      (q.degree_level ?? '').toLowerCase(),
    );
    if (levels.some((l) => l.includes('phd') || l === 'post-doc')) return 'Dr.';
    if (designation?.toLowerCase().includes('professor')) return 'Prof.';
    return null;
  }

  private resolveTeachingExperience(row: {
    total_experience_years?: string | number | null;
    joining_date?: string | null;
  }) {
    if (row.total_experience_years != null)
      return Number(row.total_experience_years);
    if (!row.joining_date) return null;
    const joined = new Date(row.joining_date);
    const years =
      (Date.now() - joined.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return Math.round(years * 10) / 10;
  }

  private needsAcademicProfile(
    profile: { orcid_id?: string | null },
    qualifications: unknown[],
  ) {
    const missingOrcid = !profile?.orcid_id?.trim();
    const missingQuals = qualifications.length === 0;
    return missingOrcid || missingQuals;
  }

  private formatIndianCurrency(amount: number) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} Lakhs`;
    return `₹${amount.toLocaleString('en-IN')}`;
  }
}

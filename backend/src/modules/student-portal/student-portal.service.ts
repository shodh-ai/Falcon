import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  openDocumentReadStream,
  resolveDocumentDiskPath,
} from '../hr/utils/document-file-path.util';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { AlumniConversionService } from '../alumni/alumni-conversion.service';
import { TicketService } from '../helpdesk/ticket.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { resolvePlacementSchema } from '../placement/placement-schema';
import { FinanceReceiptService } from '../finance/finance-receipt.service';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';
import { StudentMentorSyncService } from '../academics/student-mentor-sync.service';

const EXTRA_CERT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

@Injectable()
export class StudentPortalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: HrFieldEncryptionService,
    private readonly alumniConversion: AlumniConversionService,
    private readonly events: EventEmitter2,
    private readonly tickets: TicketService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
    private readonly objectStorage: ObjectStorageService,
    private readonly financeReceipts: FinanceReceiptService,
    private readonly enrollmentSync: StudentEnrollmentSyncService,
    private readonly mentorSync: StudentMentorSyncService,
  ) {}

  private isProfileUnlocked(until: Date | string | null): boolean {
    if (!until) return false;
    return new Date(until).getTime() > Date.now();
  }

  private maskEncrypted(value: string | null, maskFn: (v: string) => string) {
    if (!value) return null;
    try {
      const plain = this.crypto.decrypt(value);
      return plain ? maskFn(plain) : null;
    } catch {
      return '••••••••';
    }
  }

  async getMasterProfile(tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.onboarding_status,
              sp.enrollment_number, sp.enrollment_no, sp.batch, sp.category, sp.gender, sp.date_of_birth,
              sp.nationality, sp.parent_info, sp.admission_type, sp.admission_number,
              sp.admission_status, sp.aadhaar_encrypted, sp.passport_encrypted,
              sp.profile_photo_url, sp.bank_details, sp.profile_unlocked_until,
              sp.blood_group, sp.abc_id,
              d.dept_name AS department,
              COALESCE(
                sp.current_semester,
                (SELECT MAX(e.semester) FROM student_course_enrollments e WHERE e.student_user_id = u.user_id),
                1
              ) AS current_semester,
              COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'doc_type', sod.doc_type,
                      'status', sod.status,
                      'uploaded_at', sod.uploaded_at,
                      'admin_remarks', sod.admin_remarks
                    )
                    ORDER BY sod.doc_type
                  )
                  FROM student_onboarding_docs sod
                  WHERE sod.student_user_id = u.user_id
                    AND sod.tenant_id = u.tenant_id
                ),
                '[]'::jsonb
              ) AS onboarding_documents
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Student not found');
    const row = rows[0];
    const parentInfo = row.parent_info ?? {};
    const unlocked = this.isProfileUnlocked(row.profile_unlocked_until);
    return {
      student_id:
        row.enrollment_number ??
        row.admission_number ??
        row.enrollment_no ??
        row.user_id,
      enrollment_no:
        row.enrollment_number ?? row.admission_number ?? row.enrollment_no,
      name: row.name,
      email: row.email,
      mobile: parentInfo?.student_mobile ?? parentInfo?.mobile ?? null,
      blood_group: row.blood_group,
      abc_id: row.abc_id,
      category: row.category,
      gender: row.gender,
      date_of_birth: row.date_of_birth,
      nationality: row.nationality ?? 'Indian',
      program: row.department ?? 'Undergraduate Program',
      branch: row.department,
      session: row.batch,
      semester: Number(row.current_semester),
      scholarship: parentInfo?.scholarship ?? null,
      parent_details: {
        father_name: parentInfo?.father_name ?? parentInfo?.father ?? null,
        mother_name: parentInfo?.mother_name ?? parentInfo?.mother ?? null,
        parent_occupation:
          parentInfo?.parent_occupation ?? parentInfo?.occupation ?? null,
        annual_income: parentInfo?.annual_income ?? null,
        emergency_contact_name:
          parentInfo?.emergency_contact_name ??
          parentInfo?.emergency_contact ??
          null,
        emergency_contact_phone:
          parentInfo?.emergency_contact_phone ??
          parentInfo?.emergency_phone ??
          null,
        emergency_contact_priority:
          parentInfo?.emergency_contact_priority ?? 'Primary',
      },
      address: {
        permanent:
          parentInfo?.permanent_address ??
          parentInfo?.address?.permanent ??
          parentInfo?.address ??
          null,
        current:
          parentInfo?.current_address ?? parentInfo?.address?.current ?? null,
      },
      aadhaar_masked: this.maskEncrypted(row.aadhaar_encrypted, (v) =>
        this.crypto.maskAadhaar(v),
      ),
      passport_masked: this.maskEncrypted(
        row.passport_encrypted,
        (v) => `••••${v.slice(-4)}`,
      ),
      admission_type: row.admission_type,
      admission_status: row.admission_status,
      profile_photo_url: this.displayProfilePhotoUrl(row.profile_photo_url),
      bank_details: row.bank_details,
      onboarding_status: row.onboarding_status,
      onboarding_documents: row.onboarding_documents ?? [],
      profile_unlocked_until: row.profile_unlocked_until,
      is_profile_editable: unlocked,
    };
  }

  async updateProfile(
    tenantId: string,
    userId: string,
    dto: {
      profile_photo_url?: string;
      bank_details?: Record<string, any>;
      parent_details?: Record<string, any>;
      address?: { permanent?: string; current?: string };
    },
  ) {
    const profileRows = await this.dataSource.query<
      Array<{
        profile_unlocked_until: Date | null;
        parent_info: Record<string, any> | null;
      }>
    >(
      `SELECT profile_unlocked_until, parent_info FROM student_profiles WHERE user_id = $1`,
      [userId],
    );
    const profileRow = profileRows[0];
    if (!profileRow) throw new NotFoundException('Student profile not found');

    const setChunks: string[] = [];
    const values: any[] = [];
    let queryIdx = 1;

    if (dto.profile_photo_url !== undefined) {
      if (
        typeof dto.profile_photo_url === 'string' &&
        dto.profile_photo_url.startsWith('data:')
      ) {
        throw new BadRequestException(
          'Profile photo is too large to save this way. Use the photo upload button with a JPG, PNG, or WEBP file under 5 MB.',
        );
      }
      setChunks.push(`profile_photo_url = $${queryIdx++}`);
      values.push(dto.profile_photo_url);
    }
    if (dto.bank_details !== undefined) {
      setChunks.push(`bank_details = $${queryIdx++}`);
      values.push(dto.bank_details);
    }

    const wantsLockedFields =
      dto.parent_details !== undefined || dto.address !== undefined;
    if (wantsLockedFields) {
      if (!this.isProfileUnlocked(profileRow.profile_unlocked_until)) {
        throw new BadRequestException(
          'Profile fields are locked. Request a correction from Admin.',
        );
      }
      const mergedParent = {
        ...(profileRow.parent_info ?? {}),
        ...(dto.parent_details ?? {}),
      };
      if (dto.address) {
        mergedParent.permanent_address =
          dto.address.permanent ?? mergedParent.permanent_address;
        mergedParent.current_address =
          dto.address.current ?? mergedParent.current_address;
      }
      setChunks.push(`parent_info = $${queryIdx++}`);
      values.push(mergedParent);
      setChunks.push(`profile_unlocked_until = NULL`);
    }

    if (setChunks.length === 0) return { success: true };

    values.push(userId);
    await this.dataSource.query(
      `UPDATE student_profiles SET ${setChunks.join(', ')} WHERE user_id = $${queryIdx}`,
      values,
    );
    return { success: true, locked: wantsLockedFields };
  }

  async uploadProfilePhoto(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('No photo uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Profile photo must be JPG, PNG, or WEBP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Profile photo must be 5 MB or smaller');
    }

    const filePath = await this.persistProfilePhotoFile(tenantId, file);

    await this.dataSource.query(
      `INSERT INTO student_onboarding_docs (tenant_id, student_user_id, doc_type, file_path, status)
       VALUES ($1, $2, 'PHOTO', $3, 'APPROVED')
       ON CONFLICT (student_user_id, doc_type) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         status = 'APPROVED',
         uploaded_at = NOW()`,
      [tenantId, userId, filePath],
    );

    await this.dataSource.query(
      `UPDATE student_profiles SET profile_photo_url = $1, updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [filePath, userId, tenantId],
    );

    return this.getMasterProfile(tenantId, userId);
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

  private displayProfilePhotoUrl(stored: string | null): string | null {
    if (!stored?.trim()) return null;
    if (stored.startsWith('data:')) return stored;
    if (stored.startsWith('/api/student/profile/photo')) return stored;
    return '/api/student/profile/photo';
  }

  private async getProfilePhotoPath(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const [doc] = await this.dataSource.query<Array<{ file_path: string }>>(
      `SELECT file_path FROM student_onboarding_docs
       WHERE tenant_id = $1 AND student_user_id = $2 AND doc_type = 'PHOTO' AND file_path IS NOT NULL
       ORDER BY uploaded_at DESC LIMIT 1`,
      [tenantId, userId],
    );
    if (doc?.file_path) return doc.file_path;

    const [profile] = await this.dataSource.query<
      Array<{ profile_photo_url: string | null }>
    >(
      `SELECT profile_photo_url FROM student_profiles WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    const url = profile?.profile_photo_url;
    if (typeof url === 'string' && url.trim() && !url.startsWith('data:'))
      return url;
    return null;
  }

  private async persistProfilePhotoFile(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const uniqueName = `${uuidv4()}${extname(file.originalname) || '.jpg'}`;
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
    writeFileSync(fullPath, file.buffer);
    return fullPath;
  }

  async getCampusSettings(tenantId: string) {
    const rows = await this.dataSource.query<
      Array<{ settings: Record<string, unknown> | null }>
    >(`SELECT settings FROM tenants WHERE tenant_id = $1`, [tenantId]);
    const settings = rows[0]?.settings ?? {};
    return {
      is_hostel_sale_active: settings.is_hostel_sale_active === true,
    };
  }

  async getAdmissionVault(tenantId: string, userId: string) {
    const profile = await this.dataSource.query(
      `SELECT admission_type, admission_number, migration_certificate_status,
              admission_status, degree_award_status
       FROM student_profiles WHERE user_id = $1`,
      [userId],
    );

    const application = await this.dataSource
      .query(
        `SELECT sa.application_id, sa.application_no, sa.program_applied, sa.admission_type,
                sa.status, sa.submitted_at, sa.application_payload
         FROM student_applications sa
         WHERE sa.tenant_id = $1 AND sa.student_user_id = $2
         ORDER BY sa.created_at DESC LIMIT 1`,
        [tenantId, userId],
      )
      .catch(() => []);

    const entrance = application[0]
      ? await this.dataSource.query(
          `SELECT exam_name, roll_number, exam_date, score, percentile, rank_obtained, result_status
           FROM entrance_exam_details WHERE application_id = $1`,
          [application[0].application_id],
        )
      : [];

    const counseling = application[0]
      ? await this.dataSource.query(
          `SELECT round_no, counseling_date, allotted_program, seat_category, decision, remarks
           FROM counseling_details WHERE application_id = $1 ORDER BY round_no`,
          [application[0].application_id],
        )
      : [];

    const documents = await this.dataSource
      .query(
        `SELECT certificate_id, title, issuer, verification_status, file_path, uploaded_at
       FROM student_certificates
       WHERE student_user_id = $1
       ORDER BY uploaded_at DESC`,
        [userId],
      )
      .catch(() => []);

    const feeReceipts = await this.dataSource
      .query(
        `SELECT f.demand_id, f.fee_head, f.total_amount, f.paid_amount, f.status, f.due_date,
              t.receipt_url
       FROM finance_fee_demands f
       LEFT JOIN finance_transactions t ON t.demand_id = f.demand_id AND t.status = 'SUCCESS'
       WHERE f.student_user_id = $1 AND f.fee_head ILIKE '%admission%'
       ORDER BY f.created_at DESC LIMIT 5`,
        [userId],
      )
      .catch(() => []);

    return {
      profile: profile[0] ?? null,
      application: application[0] ?? null,
      entrance_exams: entrance,
      counseling_rounds: counseling,
      documents,
      admission_fee_receipts: feeReceipts,
      timeline: [
        application[0]?.submitted_at
          ? {
              label: 'Application submitted',
              date: application[0].submitted_at,
            }
          : null,
        counseling[0]?.counseling_date
          ? { label: 'Counseling', date: counseling[0].counseling_date }
          : null,
      ].filter(Boolean),
    };
  }

  async getRegistration(tenantId: string, userId: string) {
    await this.enrollmentSync.syncStudent(tenantId, userId);
    await this.mentorSync.syncStudent(tenantId, userId);

    const slot = await this.enrollmentSync.listValidCourseIdsForStudent(
      tenantId,
      userId,
    );
    const currentSemester = slot.semester;
    const validCourseIds = new Set(slot.courseIds);

    const enrollments = await this.dataSource.query(
      `SELECT e.enrollment_id, e.semester, e.status, e.grade, e.grade_points,
              c.course_id, c.course_code, c.course_name, c.credits,
              COALESCE(c.course_type, CASE WHEN c.is_elective THEN 'ELECTIVE' ELSE 'CORE' END) AS course_type
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
         AND e.status IN ('ENROLLED', 'COMPLETED')
       ORDER BY e.semester, c.course_code`,
      [userId, tenantId],
    );

    const filteredEnrollments = enrollments.filter(
      (r: { semester: number; course_id: string }) =>
        Number(r.semester) !== currentSemester ||
        validCourseIds.size === 0 ||
        validCourseIds.has(r.course_id),
    );

    const creditsEarned = filteredEnrollments
      .filter((r: { status: string }) => r.status === 'COMPLETED')
      .reduce(
        (sum: number, r: { credits: number }) => sum + Number(r.credits),
        0,
      );

    const currentSemEnrollments = filteredEnrollments.filter(
      (r: { semester: number }) => Number(r.semester) === currentSemester,
    );
    const electiveCount = currentSemEnrollments.filter(
      (r: { course_type: string }) => r.course_type === 'ELECTIVE',
    ).length;
    const electivesNeeded = Math.max(0, 2 - electiveCount);

    const electives = await this.dataSource.query(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       WHERE c.tenant_id = $1
         AND COALESCE(c.course_type, CASE WHEN c.is_elective THEN 'ELECTIVE' ELSE 'CORE' END) = 'ELECTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM student_course_enrollments e
           WHERE e.course_id = c.course_id AND e.student_user_id = $2 AND e.semester = $3
         )
       ORDER BY c.course_code`,
      [tenantId, userId, currentSemester],
    );

    return {
      current_semester: currentSemester,
      credits_earned: creditsEarned,
      credits_required: 160,
      enrollments: filteredEnrollments,
      core_enrollments: currentSemEnrollments.filter(
        (r: { course_type: string }) => r.course_type === 'CORE',
      ),
      elective_enrollments: currentSemEnrollments.filter(
        (r: { course_type: string }) => r.course_type === 'ELECTIVE',
      ),
      available_electives: electives,
      electives_needed: electivesNeeded,
      electives_max: 2,
    };
  }

  async getAttendance(tenantId: string, userId: string) {
    const profileRows = await this.dataSource.query<
      Array<{ current_semester: number | null }>
    >(
      `SELECT current_semester FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    const currentSemester = profileRows[0]?.current_semester ?? null;

    const subjectWise = await this.dataSource.query(
      `SELECT c.course_code,
              c.course_name,
              e.semester,
              e.attendance_percent,
              e.status,
              COALESCE(stats.present_count, 0)::int AS present_count,
              COALESCE(stats.absent_count, 0)::int AS absent_count,
              COALESCE(stats.total_classes, 0)::int AS total_classes
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(
             CASE
               WHEN entry->>'status' IN ('PRESENT', 'LATE', 'EXCUSED') THEN 1
               ELSE 0
             END
           )::int AS present_count,
           SUM(
             CASE WHEN entry->>'status' = 'ABSENT' THEN 1 ELSE 0 END
           )::int AS absent_count,
           COUNT(*)::int AS total_classes
         FROM course_attendance_logs cal
         CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) AS entry
         WHERE cal.tenant_id = e.tenant_id
           AND cal.course_id = e.course_id
           AND entry->>'student_id' = e.student_user_id::text
       ) stats ON true
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
         AND ($3::int IS NULL OR e.semester = $3)
       ORDER BY e.semester, c.course_code`,
      [userId, tenantId, currentSemester],
    );

    const avg =
      subjectWise.length > 0
        ? Number(
            (
              subjectWise.reduce(
                (s: number, r: { attendance_percent: string }) =>
                  s + Number(r.attendance_percent),
                0,
              ) / subjectWise.length
            ).toFixed(2),
          )
        : 0;

    const semesters = Array.from({ length: 8 }, (_, i) => {
      const sem = i + 1;
      const rows = subjectWise.filter(
        (r: { semester: number }) => Number(r.semester) === sem,
      );
      const completed =
        rows.length > 0 &&
        rows.every((r: { status: string }) => r.status === 'COMPLETED');
      const inProgress = rows.some(
        (r: { status: string }) => r.status === 'ENROLLED',
      );
      return {
        semester: sem,
        status: completed
          ? 'COMPLETED'
          : inProgress
            ? 'IN_PROGRESS'
            : rows.length
              ? 'PARTIAL'
              : 'UPCOMING',
        courses_count: rows.length,
      };
    });

    return {
      overall_percent: avg,
      subject_wise: subjectWise,
      progression: semesters,
    };
  }

  async getMarks(tenantId: string, userId: string) {
    const marks = await this.dataSource
      .query(
        `SELECT m.exam_type, m.marks_obtained, m.max_marks, m.status,
              c.course_code, c.course_name, e.semester
       FROM academic_marks m
       JOIN academic_courses c ON c.course_id = m.course_id
       LEFT JOIN student_course_enrollments e
         ON e.course_id = m.course_id AND e.student_user_id = m.student_user_id
       WHERE m.student_user_id = $1 AND m.tenant_id = $2 AND m.status = 'PUBLISHED'
       ORDER BY e.semester NULLS LAST, c.course_code, m.exam_type`,
        [userId, tenantId],
      )
      .catch(() => []);

    const gradeCards = await this.dataSource
      .query(
        `SELECT semester, cgpa, status, published_at
       FROM grade_cards
       WHERE student_user_id = $1 AND tenant_id = $2
       ORDER BY semester`,
        [userId, tenantId],
      )
      .catch(() => []);

    const enrollments = await this.dataSource.query(
      `SELECT e.semester, e.grade, e.grade_points, e.status,
              c.course_code, c.course_name, c.credits
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1`,
      [userId],
    );

    const backlogs = enrollments.filter(
      (r: { status: string }) => r.status === 'FAILED',
    );
    const failedCodes = new Set(
      backlogs.map((b: { course_code: string }) => b.course_code),
    );
    const cleared = enrollments.filter(
      (r: { status: string; course_code: string }) =>
        r.status === 'COMPLETED' && failedCodes.has(r.course_code),
    );

    const sgpaFromCards = gradeCards.map(
      (g: { semester: number; cgpa: string | null }) => ({
        semester: Number(g.semester),
        sgpa: g.cgpa != null ? Number(g.cgpa) : 0,
      }),
    );

    const semesterMap = new Map<number, { points: number; credits: number }>();
    for (const row of enrollments) {
      if (row.status !== 'COMPLETED' || row.grade_points == null) continue;
      const sem = Number(row.semester);
      const bucket = semesterMap.get(sem) ?? { points: 0, credits: 0 };
      bucket.points += Number(row.grade_points) * Number(row.credits);
      bucket.credits += Number(row.credits);
      semesterMap.set(sem, bucket);
    }
    const sgpaFromEnrollments = [...semesterMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semester, { points, credits }]) => ({
        semester,
        sgpa: credits > 0 ? Number((points / credits).toFixed(2)) : 0,
      }));

    const sgpaHistory = sgpaFromCards.length
      ? sgpaFromCards
      : sgpaFromEnrollments;
    const overallCredits = [...semesterMap.values()].reduce(
      (s, b) => s + b.credits,
      0,
    );
    const overallPoints = [...semesterMap.values()].reduce(
      (s, b) => s + b.points,
      0,
    );
    const cgpa =
      overallCredits > 0
        ? Number((overallPoints / overallCredits).toFixed(2))
        : 0;

    return {
      component_marks: marks,
      sgpa_history: sgpaHistory,
      cgpa,
      enrollments,
      backlogs: { uncleared: backlogs, cleared },
    };
  }

  async getExamDesk(tenantId: string, userId: string) {
    const examLabel = `COALESCE(sub.subject_name, sub.subject_code, es.exam_type::text, 'Exam')`;

    const ufm = await this.dataSource
      .query(
        `SELECT c.case_id, c.description, c.penalty_applied, c.status, c.logged_at,
              ${examLabel} AS exam_name, es.exam_date
       FROM ufm_cases c
       LEFT JOIN exam_schedules es ON es.exam_schedule_id = c.exam_id
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE c.student_user_id = $1 AND c.tenant_id = $2
       ORDER BY c.logged_at DESC`,
        [userId, tenantId],
      )
      .catch(() => []);

    const disciplineUfm = await this.dataSource
      .query(
        `SELECT record_id, incident_type, description, action_taken, date_logged
       FROM student_discipline_records
       WHERE student_user_id = $1 AND tenant_id = $2 AND incident_type = 'UFM'
       ORDER BY date_logged DESC`,
        [userId, tenantId],
      )
      .catch(() => []);

    const seating = await this.dataSource
      .query(
        `SELECT sp.seating_plan_id, sp.room,
              seat.elem->>'block' AS block,
              seat.elem->>'seat_no' AS seat_no,
              ${examLabel} AS exam_name, es.exam_date, es.start_time
       FROM exam_seating_plans sp
       JOIN exam_schedules es ON es.exam_schedule_id = sp.exam_schedule_id
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       JOIN LATERAL jsonb_array_elements(sp.seating_map) AS seat(elem) ON true
       WHERE sp.tenant_id = $1 AND sp.published = true
         AND seat.elem->>'student_user_id' = $2`,
        [tenantId, userId],
      )
      .catch(() => []);

    const mySeats = seating.map(
      (plan: {
        exam_name: string;
        exam_date: string;
        room: string;
        block?: string;
        seat_no?: string;
      }) => {
        const examDate = new Date(plan.exam_date);
        const hoursUntilExam =
          (examDate.getTime() - Date.now()) / (1000 * 60 * 60);
        const seatRevealed = hoursUntilExam <= 24;
        return {
          exam_name: plan.exam_name,
          exam_date: plan.exam_date,
          block: seatRevealed ? (plan.block ?? 'Main Block') : null,
          room: seatRevealed ? plan.room : null,
          seat: seatRevealed ? (plan.seat_no ?? '—') : null,
          seat_revealed: seatRevealed,
          seat_reveal_message: seatRevealed
            ? null
            : 'Will be revealed 24 hours prior to exam',
        };
      },
    );

    return { ufm_cases: [...ufm, ...disciplineUfm], seating: mySeats };
  }

  async getExtracurriculars(tenantId: string, userId: string) {
    const records = await this.dataSource.query(
      `SELECT record_id, activity_type, details, credits_awarded, event_date,
              verification_status, certificate_file_path, created_at
       FROM student_extracurriculars
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY event_date DESC NULLS LAST, created_at DESC`,
      [tenantId, userId],
    );

    const legacy = await this.dataSource
      .query(
        `SELECT program_type AS activity_type, activity_name AS details, credits_awarded, start_date AS event_date
       FROM ncc_nss_sodeca_records
       WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, userId],
      )
      .catch(() => []);

    const totals = ['NCC', 'NSS', 'SODECA'].map((type) => ({
      activity_type: type,
      credits: [...records, ...legacy]
        .filter((r: { activity_type: string }) => r.activity_type === type)
        .reduce(
          (s: number, r: { credits_awarded: number }) =>
            s + Number(r.credits_awarded ?? 0),
          0,
        ),
    }));

    return { records: [...records, ...legacy], totals };
  }

  async getDiscipline(tenantId: string, userId: string) {
    const legacy = await this.dataSource.query(
      `SELECT record_id, incident_type, description, action_taken, date_logged
       FROM student_discipline_records
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY date_logged DESC`,
      [tenantId, userId],
    );

    const demerits = await this.dataSource
      .query(
        `SELECT di.incident_id AS record_id, di.category AS incident_type, di.description,
                COALESCE(di.dc_committee_remarks, 'Demerit points approved by Disciplinary Committee') AS action_taken,
                di.updated_at::date AS date_logged, di.points, di.status,
                c.course_code, c.course_name
         FROM demerit_incidents di
         JOIN academic_courses c ON c.course_id = di.course_id
         WHERE di.tenant_id = $1 AND di.student_user_id = $2 AND di.status = 'APPROVED_BY_DC'
         ORDER BY di.updated_at DESC`,
        [tenantId, userId],
      )
      .catch(() => []);

    const summary = await this.dataSource
      .query(
        `SELECT cumulative_demerit_points, is_subject_back_triggered, subject_back_triggered_at
         FROM student_academic_summaries
         WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, userId],
      )
      .catch(() => []);

    return {
      records: [...demerits, ...legacy],
      demerit_summary: summary[0] ?? {
        cumulative_demerit_points: 0,
        is_subject_back_triggered: false,
      },
    };
  }

  async getExit(tenantId: string, userId: string) {
    let clearance = await this.dataSource.query(
      `SELECT * FROM student_exit_clearances WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, userId],
    );

    if (!clearance[0]) {
      await this.dataSource.query(
        `INSERT INTO student_exit_clearances (tenant_id, student_user_id)
         VALUES ($1, $2) ON CONFLICT (tenant_id, student_user_id) DO NOTHING`,
        [tenantId, userId],
      );
      clearance = await this.dataSource.query(
        `SELECT * FROM student_exit_clearances WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, userId],
      );
    }

    const profile = await this.dataSource.query(
      `SELECT no_dues_status, degree_issued_at, degree_award_status, final_result, alumni_conversion_flag
       FROM student_profiles WHERE user_id = $1`,
      [userId],
    );

    const tasks = await this.dataSource
      .query(
        `SELECT task_name, owner_department, status, created_at
       FROM student_exit_clearance_tasks
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY created_at`,
        [tenantId, userId],
      )
      .catch(() => []);

    const c = clearance[0] ?? {};
    const steps = [
      { key: 'library', label: 'Library', cleared: c.library_cleared },
      { key: 'finance', label: 'Finance', cleared: c.finance_cleared },
      { key: 'hostel', label: 'Hostel', cleared: c.hostel_cleared },
      { key: 'dept', label: 'Department', cleared: c.dept_cleared },
    ];
    const clearedCount = steps.filter((s) => s.cleared).length;

    return {
      no_dues: steps,
      progress_percent: Math.round((clearedCount / steps.length) * 100),
      degree_issued_date: c.degree_issued_date ?? profile[0]?.degree_issued_at,
      degree_award_status: profile[0]?.degree_award_status,
      final_result: profile[0]?.final_result,
      alumni_converted:
        c.alumni_converted ?? profile[0]?.alumni_conversion_flag,
      linkedin_url: c.linkedin_url,
      placement_organization: c.placement_organization,
      clearance_tasks: tasks,
      alumni_eligibility: await this.alumniConversion.getConversionEligibility(
        tenantId,
        userId,
      ),
    };
  }

  async registerAlumni(
    tenantId: string,
    userId: string,
    dto: { linkedin_url?: string; placement_organization?: string },
  ) {
    await this.dataSource.query(
      `UPDATE student_exit_clearances
       SET linkedin_url = $3, placement_organization = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [
        tenantId,
        userId,
        dto.linkedin_url ?? null,
        dto.placement_organization ?? null,
      ],
    );
    return this.alumniConversion.enqueueConversion({
      tenantId,
      studentUserId: userId,
      autoVerify: false,
      linkedinUrl: dto.linkedin_url,
      placementOrganization: dto.placement_organization,
    });
  }

  listAlumniMentors(tenantId: string) {
    return this.dataSource.query(
      `SELECT alumni_id, name, batch_year, current_organization, designation, linkedin_url
       FROM alumni_profiles
       WHERE tenant_id = $1 AND opt_in_mentorship = true
         AND verification_status IN ('VERIFIED', 'APPROVED')
       ORDER BY name ASC`,
      [tenantId],
    );
  }

  async requestProfileUpdate(
    tenantId: string,
    userId: string,
    dto: { subject: string; description: string; fields_requested?: string[] },
  ) {
    if (!dto.subject?.trim() || !dto.description?.trim()) {
      throw new BadRequestException('Subject and description are required');
    }
    const description = `${dto.description.trim()}${dto.fields_requested?.length ? `\n\nFields: ${dto.fields_requested.join(', ')}` : ''}`;
    const ticket = await this.tickets.createTicket(userId, {
      category: 'STUDENT_PROFILE',
      subject: dto.subject.trim(),
      description,
    });
    return {
      ticket_id: ticket.ticket_id,
      message: 'Profile correction submitted to Academic Admin.',
    };
  }

  async logExtracurricular(
    tenantId: string,
    userId: string,
    dto: { activity_type: string; description: string; event_date: string },
    file?: Express.Multer.File,
  ) {
    const activityType = dto.activity_type?.trim().toUpperCase();
    if (!['NCC', 'NSS', 'SODECA', 'OTHER'].includes(activityType)) {
      throw new BadRequestException('Invalid activity type');
    }
    if (!dto.description?.trim() || !dto.event_date) {
      throw new BadRequestException('Description and date are required');
    }
    if (!file) throw new BadRequestException('Certificate PDF is required');
    if (!EXTRA_CERT_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPG, and PNG files are allowed');
    }

    const filePath = await this.persistExtracurricularFile(tenantId, file);
    const rows = await this.dataSource.query(
      `INSERT INTO student_extracurriculars (
         tenant_id, student_user_id, activity_type, details, credits_awarded,
         event_date, verification_status, certificate_file_path
       ) VALUES ($1, $2, $3, $4, 0, $5::date, 'PENDING_VERIFICATION', $6)
       RETURNING record_id`,
      [
        tenantId,
        userId,
        activityType,
        dto.description.trim(),
        dto.event_date,
        filePath,
      ],
    );

    const student = await this.dataSource.query<Array<{ name: string }>>(
      `SELECT name FROM users WHERE user_id = $1`,
      [userId],
    );
    try {
      const proctor = await this.workflowRouting.getStudentProctor(userId);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: proctor,
        title: 'Extracurricular activity pending verification',
        message: `${student[0]?.name ?? 'A student'} logged ${activityType} activity for review.`,
        actionLink: '/iqac/student-achievements',
        category: 'ACADEMICS',
        requesterName: student[0]?.name,
      });
    } catch {
      // Proctor not assigned — IQAC admins poll the verification queue separately.
    }

    return { record_id: rows[0].record_id, status: 'PENDING_VERIFICATION' };
  }

  private async persistExtracurricularFile(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return stored.url;
    }
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const dir = resolve(
      uploadPath,
      tenantId,
      `${date.getFullYear()}`,
      `${date.getMonth() + 1}`,
    );
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fullPath = resolve(dir, uniqueName);
    writeFileSync(fullPath, file.buffer);
    return fullPath;
  }

  async getLibrary(tenantId: string, userId: string) {
    const books = await this.dataSource
      .query(
        `SELECT title, author, available_copies, shelf_location
       FROM operations_library_books
       ORDER BY title LIMIT 20`,
      )
      .catch(() => []);

    const dues = await this.dataSource
      .query(
        `SELECT fee_head, total_amount - paid_amount AS outstanding, status
       FROM finance_fee_demands
       WHERE student_user_id = $1 AND fee_head ILIKE '%library%'
       ORDER BY due_date DESC`,
        [userId],
      )
      .catch(() => []);

    const exit = await this.dataSource.query(
      `SELECT library_cleared FROM student_exit_clearances
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, userId],
    );

    return {
      active_loans: [],
      catalog_sample: books,
      library_dues: dues,
      library_cleared: exit[0]?.library_cleared ?? false,
    };
  }

  async getTransport(tenantId: string, userId: string) {
    const routes = await this.dataSource
      .query(
        `SELECT route_code, route_name, bus_number, capacity, annual_fee, stops
       FROM operations_transport_routes
       WHERE is_active = true
       ORDER BY route_name`,
      )
      .catch(() => []);

    return {
      assigned_route: routes[0] ?? null,
      all_routes: routes,
      note: routes.length
        ? null
        : 'Transport allocation will appear once assigned by Admin.',
    };
  }

  async getPlacements(tenantId: string, userId: string) {
    const s = await resolvePlacementSchema(this.dataSource).catch(() => null);

    if (s?.drivesTable === 'placement_ats_drives') {
      const drives = await this.dataSource
        .query(
          `SELECT d.drive_id, COALESCE(d.job_role, d.job_profile) AS job_title, d.min_cgpa,
                COALESCE(d.deadline, d.drive_date::timestamptz) AS application_deadline,
                COALESCE(d.package_lpa, d.package_details_lpa) AS package_lpa,
                c.company_name, d.description
         FROM placement_ats_drives d
         JOIN placement_companies c ON c.company_id = d.company_id
         WHERE d.tenant_id = $1 AND d.status IN ('ACTIVE', 'OPEN')
         ORDER BY d.created_at DESC`,
          [tenantId],
        )
        .catch(() => []);

      const applications = await this.dataSource
        .query(
          `SELECT a.application_id, a.pipeline_stage AS status, a.rejected_at_stage,
                a.applied_at, COALESCE(d.job_role, d.job_profile) AS job_title,
                c.company_name, d.drive_id
         FROM placement_ats_drive_applications a
         JOIN placement_ats_drives d ON d.drive_id = a.drive_id
         JOIN placement_companies c ON c.company_id = d.company_id
         WHERE a.student_user_id = $1
         ORDER BY a.applied_at DESC`,
          [userId],
        )
        .catch(() => []);

      return { open_jobs: drives, my_applications: applications };
    }

    const drives = await this.dataSource
      .query(
        `SELECT d.placement_drive_id AS drive_id,
              COALESCE(d.job_role, d.role_title) AS job_title, d.min_cgpa,
              d.deadline AS application_deadline, d.package_lpa, d.company_name, d.description
       FROM placement_drives d
       WHERE d.status IN ('ACTIVE', 'OPEN')
       ORDER BY d.created_at DESC`,
      )
      .catch(() => []);

    const applications = await this.dataSource
      .query(
        `SELECT a.application_id, COALESCE(a.status, 'APPLIED') AS status,
              a.applied_at, COALESCE(d.job_role, d.role_title) AS job_title,
              d.company_name, d.placement_drive_id AS drive_id
       FROM placement_applications a
       JOIN placement_drives d ON d.placement_drive_id = a.placement_drive_id
       WHERE a.student_user_id = $1
       ORDER BY a.applied_at DESC NULLS LAST`,
        [userId],
      )
      .catch(() => []);

    return { open_jobs: drives, my_applications: applications };
  }

  async getFinanceLedger(userId: string) {
    const pending_demands = await this.dataSource.query(
      `SELECT demand_id, fee_head, academic_year, semester, total_amount, paid_amount, due_date, status, fee_breakup
       FROM finance_fee_demands
       WHERE student_user_id = $1 AND status NOT IN ('PAID', 'WAIVED')
       ORDER BY due_date ASC`,
      [userId],
    );

    const payment_history = await this.dataSource.query(
      `SELECT t.transaction_id, t.amount, t.status, t.payment_mode, t.receipt_url, t.created_at,
              t.gateway_payment_id, t.demand_id, d.fee_head
       FROM finance_transactions t
       LEFT JOIN finance_fee_demands d ON d.demand_id = t.demand_id
       WHERE t.student_user_id = $1 AND t.status = 'SUCCESS'
       ORDER BY t.created_at DESC`,
      [userId],
    );

    const total_outstanding = (
      pending_demands as Array<{ total_amount: string; paid_amount: string }>
    ).reduce(
      (sum, row) =>
        sum +
        Math.max(0, Number(row.total_amount) - Number(row.paid_amount ?? 0)),
      0,
    );

    const hostelFinesPending = await this.dataSource
      .query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count FROM operations_hostel_fines
       WHERE student_user_id = $1 AND status = 'PENDING'`,
        [userId],
      )
      .catch(() => [{ count: '0' }]);

    const hasOpenDemands = total_outstanding > 0;
    const hostelFineCount = Number(hostelFinesPending[0]?.count ?? 0);

    return {
      pending_demands,
      payment_history,
      total_outstanding,
      gates: {
        admit_card_locked: hasOpenDemands,
        no_dues_blocked: hasOpenDemands,
        hostel_fines_pending: hostelFineCount,
        message: hasOpenDemands
          ? 'Clear outstanding fee demands to unlock your admit card and no-dues certificate.'
          : 'All fee demands cleared — admit card and no-dues are unlocked.',
      },
    };
  }

  async createPaymentOrder(userId: string, demandId: string) {
    const rows = await this.dataSource.query(
      `SELECT demand_id, fee_head, total_amount, paid_amount, status
       FROM finance_fee_demands WHERE demand_id = $1 AND student_user_id = $2`,
      [demandId, userId],
    );
    const demand = rows[0] as
      | {
          demand_id: string;
          fee_head: string;
          total_amount: string;
          paid_amount: string;
          status: string;
        }
      | undefined;
    if (!demand) throw new NotFoundException('Fee demand not found');
    if (demand.status === 'PAID')
      throw new BadRequestException('This demand is already paid');

    const outstanding = Math.max(
      0,
      Number(demand.total_amount) - Number(demand.paid_amount ?? 0),
    );
    if (outstanding <= 0)
      throw new BadRequestException('Nothing due on this demand');

    const orderId = `order_${demandId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    return {
      order_id: orderId,
      demand_id: demandId,
      amount_inr: outstanding,
      amount_paise: Math.round(outstanding * 100),
      currency: 'INR',
      fee_head: demand.fee_head,
      razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
      mock: true,
    };
  }

  async payDemandMock(
    userId: string,
    demandId: string,
    gatewayPaymentId?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT * FROM finance_fee_demands WHERE demand_id = $1 AND student_user_id = $2`,
      [demandId, userId],
    );
    const demand = rows[0] as
      | {
          demand_id: string;
          total_amount: string;
          paid_amount: string;
          status: string;
        }
      | undefined;
    if (!demand) {
      throw new BadRequestException('Fee demand not found');
    }
    if (demand.status === 'PAID') {
      return { already_paid: true, demand_id: demandId };
    }

    const outstanding = Math.max(
      0,
      Number(demand.total_amount) - Number(demand.paid_amount ?? 0),
    );
    if (outstanding <= 0) {
      throw new BadRequestException('Nothing due on this demand');
    }

    const paymentId = gatewayPaymentId ?? `pay_${Date.now()}`;
    const demandMeta = await this.dataSource.query<
      Array<{ fee_head: string; tenant_id: string }>
    >(
      `SELECT d.fee_head, u.tenant_id FROM finance_fee_demands d
       JOIN users u ON u.user_id = d.student_user_id
       WHERE d.demand_id = $1`,
      [demandId],
    );
    const feeHead = demandMeta[0]?.fee_head ?? 'FEE';
    const tenantId =
      demandMeta[0]?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    const receiptNumber = `RCP-${paymentId.replace(/\W/g, '').slice(-12).toUpperCase()}`;

    const txnRows = await this.dataSource.query(
      `INSERT INTO finance_transactions (
         student_user_id, demand_id, gateway, gateway_payment_id, gateway_reference,
         amount, status, payment_mode, receipt_url
       ) VALUES ($1, $2, 'RAZORPAY', $3, $3, $4, 'SUCCESS', 'UPI', $5)
       RETURNING *`,
      [userId, demandId, paymentId, outstanding, `/receipts/${paymentId}.pdf`],
    );
    const transactionId = txnRows[0]?.transaction_id as string;

    let receiptUrl = txnRows[0]?.receipt_url as string;
    try {
      receiptUrl = await this.financeReceipts.generateAndStore({
        tenantId,
        transactionId,
        receiptNumber,
        studentUserId: userId,
        amount: outstanding,
        paymentMode: 'UPI',
        feeHead,
      });
      await this.dataSource.query(
        `UPDATE finance_transactions SET receipt_url = $2 WHERE transaction_id = $1`,
        [transactionId, receiptUrl],
      );
      await this.dataSource.query(
        `INSERT INTO student_documents (tenant_id, student_user_id, category, title, file_url, source_transaction_id)
         VALUES ($1, $2, 'FEE_RECEIPTS', $3, $4, $5)`,
        [
          tenantId,
          userId,
          `${feeHead} Receipt — ${receiptNumber}`,
          receiptUrl,
          transactionId,
        ],
      );
    } catch (err) {
      // Receipt generation is best-effort; payment still recorded
    }

    await this.dataSource.query(
      `UPDATE finance_fee_demands
       SET paid_amount = total_amount, status = 'PAID'
       WHERE demand_id = $1`,
      [demandId],
    );

    await this.dataSource
      .query(
        `UPDATE operations_hostel_fines SET status = 'PAID'
       WHERE finance_demand_id = $1 AND student_user_id = $2`,
        [demandId, userId],
      )
      .catch(() => undefined);

    await this.dataSource
      .query(
        `UPDATE student_profiles SET no_dues_status = 'CLEARED'
       WHERE user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM finance_fee_demands fd
           WHERE fd.student_user_id = $1 AND fd.status NOT IN ('PAID', 'WAIVED')
         )`,
        [userId],
      )
      .catch(() => undefined);

    this.events.emit('finance.demand_paid', {
      tenantId,
      studentUserId: userId,
      demandId,
      amount: outstanding,
      feeHead,
    });

    const ledger = await this.getFinanceLedger(userId);

    return {
      success: true,
      transaction: txnRows[0],
      receipt_url: receiptUrl,
      document_vault_added: true,
      message: `Payment of ₹${outstanding} recorded successfully`,
      gates: ledger.gates,
    };
  }

  async getDocumentVault(tenantId: string, userId: string) {
    const docs = await this.dataSource
      .query(
        `SELECT document_id, category, title, file_url, source_transaction_id, created_at
       FROM student_documents
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY created_at DESC`,
        [tenantId, userId],
      )
      .catch(() => []);
    return { documents: docs };
  }

  async getPolicies(tenantId: string, userId: string) {
    const policies = await this.dataSource.query(
      `SELECT p.policy_id, p.title, p.description, p.file_url, p.is_mandatory, 
              p.is_voting_enabled, p.authority_role as category,
              a.ack_id IS NOT NULL as acknowledged,
              a.vote as user_vote
       FROM university_policies p
       LEFT JOIN student_policy_acknowledgements a 
         ON a.policy_id = p.policy_id AND a.student_user_id = $1 AND a.tenant_id = $2
       WHERE p.tenant_id = $2 AND p.status = 'ACTIVE'
       ORDER BY p.created_at DESC`,
      [userId, tenantId],
    );
    return policies;
  }

  async acknowledgePolicy(
    tenantId: string,
    userId: string,
    policyId: string,
    vote?: 'YES' | 'NO',
  ) {
    await this.dataSource.query(
      `INSERT INTO student_policy_acknowledgements (tenant_id, student_user_id, policy_id, vote)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, student_user_id, policy_id) 
       DO UPDATE SET vote = COALESCE(EXCLUDED.vote, student_policy_acknowledgements.vote),
                     acknowledged_at = NOW()`,
      [tenantId, userId, policyId, vote || null],
    );
    return { success: true };
  }
}

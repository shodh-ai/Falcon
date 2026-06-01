import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { AlumniConversionService } from '../alumni/alumni-conversion.service';

@Injectable()
export class StudentPortalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: HrFieldEncryptionService,
    private readonly alumniConversion: AlumniConversionService,
  ) {}

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
      `SELECT u.user_id, u.name, u.official_email AS email,
              sp.enrollment_no, sp.batch, sp.category, sp.gender, sp.date_of_birth,
              sp.nationality, sp.parent_info, sp.admission_type, sp.admission_number,
              sp.admission_status, sp.aadhaar_encrypted, sp.passport_encrypted,
              d.dept_name AS department,
              COALESCE(
                (SELECT MAX(e.semester) FROM student_course_enrollments e WHERE e.student_user_id = u.user_id),
                1
              ) AS current_semester
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Student not found');
    const row = rows[0];
    return {
      student_id: row.enrollment_no ?? row.user_id,
      enrollment_no: row.enrollment_no,
      name: row.name,
      email: row.email,
      mobile: row.parent_info?.student_mobile ?? row.parent_info?.mobile ?? null,
      category: row.category,
      gender: row.gender,
      date_of_birth: row.date_of_birth,
      nationality: row.nationality ?? 'Indian',
      program: row.department ?? 'Undergraduate Program',
      branch: row.department,
      session: row.batch,
      semester: Number(row.current_semester),
      scholarship: row.parent_info?.scholarship ?? null,
      parent_details: row.parent_info,
      address: row.parent_info?.address ?? null,
      aadhaar_masked: this.maskEncrypted(row.aadhaar_encrypted, (v) => this.crypto.maskAadhaar(v)),
      passport_masked: this.maskEncrypted(row.passport_encrypted, (v) => `••••${v.slice(-4)}`),
      admission_type: row.admission_type,
      admission_status: row.admission_status,
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

    const documents = await this.dataSource.query(
      `SELECT certificate_id, title, issuer, verification_status, file_path, uploaded_at
       FROM student_certificates
       WHERE student_user_id = $1
       ORDER BY uploaded_at DESC`,
      [userId],
    ).catch(() => []);

    const feeReceipts = await this.dataSource.query(
      `SELECT demand_id, fee_head, total_amount, paid_amount, status, due_date
       FROM finance_fee_demands
       WHERE student_user_id = $1 AND fee_head ILIKE '%admission%'
       ORDER BY created_at DESC LIMIT 5`,
      [userId],
    ).catch(() => []);

    return {
      profile: profile[0] ?? null,
      application: application[0] ?? null,
      entrance_exams: entrance,
      counseling_rounds: counseling,
      documents,
      admission_fee_receipts: feeReceipts,
      timeline: [
        application[0]?.submitted_at
          ? { label: 'Application submitted', date: application[0].submitted_at }
          : null,
        counseling[0]?.counseling_date
          ? { label: 'Counseling', date: counseling[0].counseling_date }
          : null,
      ].filter(Boolean),
    };
  }

  async getRegistration(tenantId: string, userId: string) {
    const enrollments = await this.dataSource.query(
      `SELECT e.enrollment_id, e.semester, e.status, e.grade, e.grade_points,
              c.course_id, c.course_code, c.course_name, c.credits, c.is_elective
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
       ORDER BY e.semester, c.course_code`,
      [userId, tenantId],
    );

    const creditsEarned = enrollments
      .filter((r: { status: string }) => r.status === 'COMPLETED')
      .reduce((sum: number, r: { credits: number }) => sum + Number(r.credits), 0);

    const electives = await this.dataSource.query(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       WHERE c.tenant_id = $1 AND c.is_elective = true
         AND NOT EXISTS (
           SELECT 1 FROM student_course_enrollments e
           WHERE e.course_id = c.course_id AND e.student_user_id = $2
         )
       ORDER BY c.course_code`,
      [tenantId, userId],
    );

    const currentSemester = await this.dataSource.query(
      `SELECT COALESCE(MAX(semester), 1) AS semester
       FROM student_course_enrollments WHERE student_user_id = $1`,
      [userId],
    );

    return {
      current_semester: Number(currentSemester[0]?.semester ?? 1),
      credits_earned: creditsEarned,
      credits_required: 160,
      enrollments,
      available_electives: electives,
    };
  }

  async getAttendance(tenantId: string, userId: string) {
    const subjectWise = await this.dataSource.query(
      `SELECT c.course_code, c.course_name, e.semester, e.attendance_percent, e.status
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
       ORDER BY e.semester, c.course_code`,
      [userId, tenantId],
    );

    const avg =
      subjectWise.length > 0
        ? Number(
            (
              subjectWise.reduce(
                (s: number, r: { attendance_percent: string }) => s + Number(r.attendance_percent),
                0,
              ) / subjectWise.length
            ).toFixed(2),
          )
        : 0;

    const semesters = Array.from({ length: 8 }, (_, i) => {
      const sem = i + 1;
      const rows = subjectWise.filter((r: { semester: number }) => Number(r.semester) === sem);
      const completed = rows.length > 0 && rows.every((r: { status: string }) => r.status === 'COMPLETED');
      const inProgress = rows.some((r: { status: string }) => r.status === 'ENROLLED');
      return {
        semester: sem,
        status: completed ? 'COMPLETED' : inProgress ? 'IN_PROGRESS' : rows.length ? 'PARTIAL' : 'UPCOMING',
        courses_count: rows.length,
      };
    });

    return { overall_percent: avg, subject_wise: subjectWise, progression: semesters };
  }

  async getMarks(tenantId: string, userId: string) {
    const marks = await this.dataSource.query(
      `SELECT m.exam_type, m.marks_obtained, m.max_marks, m.status,
              c.course_code, c.course_name, e.semester
       FROM academic_marks m
       JOIN academic_courses c ON c.course_id = m.course_id
       LEFT JOIN student_course_enrollments e
         ON e.course_id = m.course_id AND e.student_user_id = m.student_user_id
       WHERE m.student_user_id = $1 AND m.tenant_id = $2 AND m.status = 'PUBLISHED'
       ORDER BY e.semester NULLS LAST, c.course_code, m.exam_type`,
      [userId, tenantId],
    ).catch(() => []);

    const gradeCards = await this.dataSource.query(
      `SELECT semester, cgpa, status, published_at
       FROM grade_cards
       WHERE student_user_id = $1 AND tenant_id = $2
       ORDER BY semester`,
      [userId, tenantId],
    ).catch(() => []);

    const enrollments = await this.dataSource.query(
      `SELECT e.semester, e.grade, e.grade_points, e.status,
              c.course_code, c.course_name, c.credits
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1`,
      [userId],
    );

    const backlogs = enrollments.filter((r: { status: string }) => r.status === 'FAILED');
    const failedCodes = new Set(backlogs.map((b: { course_code: string }) => b.course_code));
    const cleared = enrollments.filter(
      (r: { status: string; course_code: string }) =>
        r.status === 'COMPLETED' && failedCodes.has(r.course_code),
    );

    const sgpaFromCards = gradeCards.map((g: { semester: number; cgpa: string | null }) => ({
      semester: Number(g.semester),
      sgpa: g.cgpa != null ? Number(g.cgpa) : 0,
    }));

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

    const sgpaHistory = sgpaFromCards.length ? sgpaFromCards : sgpaFromEnrollments;
    const overallCredits = [...semesterMap.values()].reduce((s, b) => s + b.credits, 0);
    const overallPoints = [...semesterMap.values()].reduce((s, b) => s + b.points, 0);
    const cgpa = overallCredits > 0 ? Number((overallPoints / overallCredits).toFixed(2)) : 0;

    return {
      component_marks: marks,
      sgpa_history: sgpaHistory,
      cgpa,
      enrollments,
      backlogs: { uncleared: backlogs, cleared },
    };
  }

  async getExamDesk(tenantId: string, userId: string) {
    const ufm = await this.dataSource.query(
      `SELECT c.case_id, c.description, c.penalty_applied, c.status, c.logged_at,
              es.exam_name, es.exam_date
       FROM ufm_cases c
       LEFT JOIN exam_schedules es ON es.exam_schedule_id = c.exam_id
       WHERE c.student_user_id = $1 AND c.tenant_id = $2
       ORDER BY c.logged_at DESC`,
      [userId, tenantId],
    ).catch(() => []);

    const disciplineUfm = await this.dataSource.query(
      `SELECT record_id, incident_type, description, action_taken, date_logged
       FROM student_discipline_records
       WHERE student_user_id = $1 AND tenant_id = $2 AND incident_type = 'UFM'
       ORDER BY date_logged DESC`,
      [userId, tenantId],
    );

    const seating = await this.dataSource.query(
      `SELECT sp.seating_plan_id, sp.room, sp.seating_map, es.exam_name, es.exam_date, es.start_time
       FROM exam_seating_plans sp
       JOIN exam_schedules es ON es.exam_schedule_id = sp.exam_schedule_id
       WHERE sp.tenant_id = $1 AND sp.published = true`,
      [tenantId],
    );

    const mySeats = seating
      .map((plan: { seating_map: unknown[]; exam_name: string; exam_date: string; room: string }) => {
        const map = Array.isArray(plan.seating_map) ? plan.seating_map : [];
        const seat = map.find(
          (s: { student_user_id?: string }) => s.student_user_id === userId,
        ) as { block?: string; seat_no?: string } | undefined;
        if (!seat) return null;
        return {
          exam_name: plan.exam_name,
          exam_date: plan.exam_date,
          block: seat.block ?? 'Main Block',
          room: plan.room,
          seat: seat.seat_no ?? '—',
        };
      })
      .filter(Boolean);

    return { ufm_cases: [...ufm, ...disciplineUfm], seating: mySeats };
  }

  async getExtracurriculars(tenantId: string, userId: string) {
    const records = await this.dataSource.query(
      `SELECT record_id, activity_type, details, credits_awarded, event_date, created_at
       FROM student_extracurriculars
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY event_date DESC NULLS LAST, created_at DESC`,
      [tenantId, userId],
    );

    const legacy = await this.dataSource.query(
      `SELECT program_type AS activity_type, activity_name AS details, credits_awarded, start_date AS event_date
       FROM ncc_nss_sodeca_records
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, userId],
    ).catch(() => []);

    const totals = ['NCC', 'NSS', 'SODECA'].map((type) => ({
      activity_type: type,
      credits: [...records, ...legacy]
        .filter((r: { activity_type: string }) => r.activity_type === type)
        .reduce((s: number, r: { credits_awarded: number }) => s + Number(r.credits_awarded ?? 0), 0),
    }));

    return { records: [...records, ...legacy], totals };
  }

  async getDiscipline(tenantId: string, userId: string) {
    return this.dataSource.query(
      `SELECT record_id, incident_type, description, action_taken, date_logged
       FROM student_discipline_records
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY date_logged DESC`,
      [tenantId, userId],
    );
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

    const tasks = await this.dataSource.query(
      `SELECT task_name, owner_department, status, created_at
       FROM student_exit_clearance_tasks
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY created_at`,
      [tenantId, userId],
    ).catch(() => []);

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
      alumni_converted: c.alumni_converted ?? profile[0]?.alumni_conversion_flag,
      linkedin_url: c.linkedin_url,
      placement_organization: c.placement_organization,
      clearance_tasks: tasks,
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
      [tenantId, userId, dto.linkedin_url ?? null, dto.placement_organization ?? null],
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
    const rows = await this.dataSource.query(
      `INSERT INTO helpdesk_tickets (student_user_id, category, subject, description, status)
       VALUES ($1, 'ACADEMICS', $2, $3, 'PENDING')
       RETURNING ticket_id`,
      [
        userId,
        dto.subject.trim(),
        `${dto.description.trim()}${dto.fields_requested?.length ? `\n\nFields: ${dto.fields_requested.join(', ')}` : ''}`,
      ],
    );
    return { ticket_id: rows[0].ticket_id, message: 'Profile update request submitted to Admin.' };
  }

  async getLibrary(tenantId: string, userId: string) {
    const books = await this.dataSource.query(
      `SELECT title, author, available_copies, shelf_location
       FROM operations_library_books
       ORDER BY title LIMIT 20`,
    ).catch(() => []);

    const dues = await this.dataSource.query(
      `SELECT fee_head, total_amount - paid_amount AS outstanding, status
       FROM finance_fee_demands
       WHERE student_user_id = $1 AND fee_head ILIKE '%library%'
       ORDER BY due_date DESC`,
      [userId],
    ).catch(() => []);

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
    const routes = await this.dataSource.query(
      `SELECT route_code, route_name, bus_number, capacity, annual_fee, stops
       FROM operations_transport_routes
       WHERE is_active = true
       ORDER BY route_name`,
    ).catch(() => []);

    return {
      assigned_route: routes[0] ?? null,
      all_routes: routes,
      note: routes.length ? null : 'Transport allocation will appear once assigned by Admin.',
    };
  }

  async getPlacements(tenantId: string, userId: string) {
    const jobs = await this.dataSource.query(
      `SELECT j.jd_id, j.title AS job_title, j.min_cgpa, j.application_deadline, c.company_name, j.job_profile
       FROM placement_job_descriptions j
       JOIN placement_companies c ON c.company_id = j.company_id
       WHERE j.tenant_id = $1 AND j.status = 'OPEN'
       ORDER BY j.created_at DESC`,
      [tenantId],
    ).catch(() => []);

    const applications = await this.dataSource.query(
      `SELECT pa.application_id, pa.status, pa.applied_at, j.title AS job_title, c.company_name
       FROM placement_applications pa
       JOIN placement_job_descriptions j ON j.jd_id = pa.jd_id
       JOIN placement_companies c ON c.company_id = j.company_id
       WHERE pa.student_user_id = $1
       ORDER BY pa.applied_at DESC`,
      [userId],
    ).catch(() => []);

    return { open_jobs: jobs, my_applications: applications };
  }
}

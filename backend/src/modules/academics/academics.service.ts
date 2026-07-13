import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { User } from '../../entities/user.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateGradingPolicyDto } from './dto/create-grading-policy.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { StudentEnrollmentSyncService } from './student-enrollment-sync.service';
import { StudentMentorSyncService } from './student-mentor-sync.service';

/**
 * NOTE: `markAttendance` writes straight to Postgres for now. When traffic
 * picks up at 9:00 AM lecture starts, swap the body to enqueue a BullMQ job
 * and have a worker flush a Redis buffer in bulk inserts of ~500 rows.
 */
@Injectable()
export class AcademicsService {
  constructor(
    @InjectRepository(Subject) private subjects: Repository<Subject>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(AttendanceRecord)
    private attendance: Repository<AttendanceRecord>,
    @InjectRepository(ExamResult) private results: Repository<ExamResult>,
    @InjectRepository(GradingPolicy)
    private gradingPolicies: Repository<GradingPolicy>,
    @InjectRepository(AcademicCourse)
    private courses: Repository<AcademicCourse>,
    @InjectRepository(StudentCourseEnrollment)
    private courseEnrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(AcademicTimetable)
    private timetables: Repository<AcademicTimetable>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(StaffAttendance)
    private staffAttendance: Repository<StaffAttendance>,
    @InjectRepository(StaffLeaveRequest)
    private staffLeaveRequests: Repository<StaffLeaveRequest>,
    @InjectRepository(StaffGatePass)
    private staffGatePasses: Repository<StaffGatePass>,
    @InjectRepository(HelpdeskTicket)
    private helpdeskTickets: Repository<HelpdeskTicket>,
    @InjectRepository(StudentProfile)
    private studentProfiles: Repository<StudentProfile>,
    private readonly notify: NotificationEmitterService,
    private readonly enrollmentSync: StudentEnrollmentSyncService,
    private readonly mentorSync: StudentMentorSyncService,
  ) {}

  private async notifyCourseStudents(
    tenantId: string,
    courseId: string,
    courseName: string,
    changeSummary: string,
  ) {
    const enrollments = await this.courseEnrollments.find({
      where: { tenant_id: tenantId, course_id: courseId },
    });
    for (const row of enrollments) {
      this.notify.timetableChanged({
        tenantId,
        userId: row.student_user_id,
        courseName,
        changeSummary,
      });
    }
  }

  listSubjects() {
    return this.subjects.find({ order: { subject_code: 'ASC' } });
  }

  createSubject(dto: CreateSubjectDto) {
    return this.subjects.save(this.subjects.create(dto));
  }

  listBatches() {
    return this.batches.find({ order: { academic_year: 'DESC' } });
  }

  async markAttendance(dto: MarkAttendanceDto, markedByUserId: string) {
    const rows = dto.entries.map((entry) =>
      this.attendance.create({
        student_user_id: entry.student_user_id,
        status: entry.status,
        subject_id: dto.subject_id,
        batch_id: dto.batch_id,
        session_date: dto.session_date,
        session_slot: dto.session_slot,
        marked_by_user_id: markedByUserId,
      }),
    );
    return this.attendance.save(rows);
  }

  listResultsForStudent(studentUserId: string) {
    return this.results.find({ where: { student_user_id: studentUserId } });
  }

  listGradingPolicies() {
    return this.gradingPolicies.find({ order: { effective_from: 'DESC' } });
  }

  createGradingPolicy(dto: CreateGradingPolicyDto) {
    return this.gradingPolicies.save(this.gradingPolicies.create(dto));
  }

  async getStudentDashboardSummary(studentUserId: string) {
    return this.getDashboardMetrics(studentUserId);
  }

  async getDashboardMetrics(studentUserId: string) {
    const enrollments = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId },
      relations: ['course'],
      order: { semester: 'ASC' },
    });

    const completed = enrollments.filter(
      (row) => row.status === 'COMPLETED' && row.grade_points !== null,
    );
    const weightedGradePoints = completed.reduce(
      (sum, row) => sum + Number(row.grade_points) * row.course.credits,
      0,
    );
    const creditsCompleted = completed.reduce(
      (sum, row) => sum + row.course.credits,
      0,
    );
    const cgpa =
      creditsCompleted > 0
        ? Number((weightedGradePoints / creditsCompleted).toFixed(2))
        : 0;

    const attendanceRows = enrollments.filter(
      (row) => row.attendance_percent !== null,
    );
    const attendancePercent =
      attendanceRows.length > 0
        ? Number(
            (
              attendanceRows.reduce(
                (sum, row) => sum + Number(row.attendance_percent),
                0,
              ) / attendanceRows.length
            ).toFixed(2),
          )
        : 0;

    return {
      cgpa,
      credits_completed: creditsCompleted,
      credits_required: 160,
      attendance_percent: attendancePercent,
      completed_courses: completed.map((row) => this.toEnrollmentDto(row)),
      enrolled_courses: enrollments
        .filter((row) => row.status === 'ENROLLED')
        .map((row) => this.toEnrollmentDto(row)),
    };
  }

  async getTodayTimetable(studentUserId: string) {
    const enrolled = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId, status: 'ENROLLED' },
    });
    const courseIds = enrolled.map((row) => row.course_id);
    if (courseIds.length === 0) return [];

    const isoDay = this.getIstDayOfWeek();
    const rows = await this.timetables.find({
      where: {
        course_id: In(courseIds),
        day_of_week: isoDay,
      },
      relations: ['course', 'faculty'],
      order: { start_time: 'ASC' },
    });

    const liveByCourse = await this.fetchActiveLiveClasses(courseIds);

    return rows.map((row) => {
      const startTime = this.normalizeTime(row.start_time);
      const endTime = this.normalizeTime(row.end_time);
      const liveJoinUrl = liveByCourse.get(row.course_id) ?? null;
      const isVirtual = Boolean(liveJoinUrl) || this.isVirtualRoom(row.room);

      return {
        timetable_id: row.timetable_id,
        course_id: row.course_id,
        course_code: row.course.course_code,
        course_name: row.course.course_name,
        credits: row.course.credits,
        room: row.room,
        faculty_name: row.faculty?.name ?? null,
        start_time: startTime,
        end_time: endTime,
        status: this.getSlotStatus(startTime, endTime),
        is_virtual: isVirtual,
        live_join_url: liveJoinUrl,
      };
    });
  }

  async getWeeklyTimetable(studentUserId: string) {
    const enrolled = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId, status: 'ENROLLED' },
    });
    if (enrolled.length === 0) return [];

    const tenantId = enrolled[0].tenant_id;
    await this.enrollmentSync.syncStudent(tenantId, studentUserId);
    const slot = await this.enrollmentSync.listValidCourseIdsForStudent(
      tenantId,
      studentUserId,
    );

    let courseIds = enrolled.map((row) => row.course_id);
    if (slot.courseIds.length > 0) {
      courseIds = enrolled
        .filter(
          (row) =>
            Number(row.semester) !== slot.semester ||
            slot.courseIds.includes(row.course_id),
        )
        .map((row) => row.course_id);
    }
    courseIds = [...new Set(courseIds)];
    if (courseIds.length === 0) return [];

    const rows = await this.timetables.find({
      where: {
        tenant_id: tenantId,
        course_id: In(courseIds),
      },
      relations: ['course', 'faculty'],
      order: { day_of_week: 'ASC', start_time: 'ASC' },
    });

    const resolvedRows = this.resolveStudentTimetableSlots(rows);
    const liveByCourse = await this.fetchActiveLiveClasses(courseIds);

    return resolvedRows.map((row) => {
      const startTime = this.normalizeTime(row.start_time);
      const endTime = this.normalizeTime(row.end_time);
      const liveJoinUrl = liveByCourse.get(row.course_id) ?? null;
      const isVirtual = Boolean(liveJoinUrl) || this.isVirtualRoom(row.room);

      return {
        timetable_id: row.timetable_id,
        course_id: row.course_id,
        course_code: row.course.course_code,
        course_name: row.course.course_name,
        credits: row.course.credits,
        room: row.room,
        faculty_name: row.faculty?.name ?? null,
        day_of_week: row.day_of_week,
        start_time: startTime,
        end_time: endTime,
        is_virtual: isVirtual,
        live_join_url: liveJoinUrl,
      };
    });
  }

  async getWeeklyTimetableCalendar(studentUserId: string, weekStartInput?: string) {
    const enrolled = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId, status: 'ENROLLED' },
    });
    const tenantId = enrolled[0]?.tenant_id;
    const courseIds = enrolled.map((row) => row.course_id);
    const weekStart = this.resolveWeekStartMonday(weekStartInput);
    const weekDates = this.buildWeekDateRange(weekStart);
    const baseSlots = await this.getWeeklyTimetable(studentUserId);

    if (!tenantId || courseIds.length === 0) {
      return {
        week_start: weekStart,
        week_dates: weekDates,
        slots: baseSlots.map((slot) => ({
          ...slot,
          session_date:
            weekDates.find((d) => d.day_of_week === slot.day_of_week)?.date ??
            null,
          attendance_status: null as 'PRESENT' | 'ABSENT' | 'PENDING' | null,
        })),
      };
    }

    const weekEnd = weekDates[weekDates.length - 1]?.date ?? weekStart;
    const logs = (await this.courseEnrollments.manager.query(
      `SELECT cal.date::text AS date, cal.course_id, cal.timetable_id, cal.attendance_data
       FROM course_attendance_logs cal
       WHERE cal.tenant_id = $1
         AND cal.course_id = ANY($2::uuid[])
         AND cal.date >= $3::date
         AND cal.date <= $4::date`,
      [tenantId, courseIds, weekStart, weekEnd],
    )) as Array<{
      date: string;
      course_id: string;
      timetable_id: string | null;
      attendance_data: Array<{ student_id: string; status: string }> | null;
    }>;

    const attendanceMap = new Map<string, string>();
    for (const log of logs) {
      const entries = Array.isArray(log.attendance_data) ? log.attendance_data : [];
      const entry = entries.find((row) => row.student_id === studentUserId);
      if (!entry) continue;
      attendanceMap.set(
        `${log.date}|${log.course_id}|${log.timetable_id ?? ''}`,
        entry.status,
      );
      if (!attendanceMap.has(`${log.date}|${log.course_id}|`)) {
        attendanceMap.set(`${log.date}|${log.course_id}|`, entry.status);
      }
    }

    const slots = baseSlots.map((slot) => {
      const sessionDate =
        weekDates.find((d) => d.day_of_week === slot.day_of_week)?.date ?? null;
      let attendance_status: 'PRESENT' | 'ABSENT' | 'PENDING' | null = null;

      if (sessionDate && this.isSessionDone(sessionDate, slot.end_time)) {
        const withTimetable = `${sessionDate}|${slot.course_id}|${slot.timetable_id}`;
        const courseOnly = `${sessionDate}|${slot.course_id}|`;
        const raw = attendanceMap.get(withTimetable) ?? attendanceMap.get(courseOnly);
        if (!raw) {
          attendance_status = 'PENDING';
        } else if (raw === 'ABSENT') {
          attendance_status = 'ABSENT';
        } else {
          attendance_status = 'PRESENT';
        }
      }

      return { ...slot, session_date: sessionDate, attendance_status };
    });

    return { week_start: weekStart, week_dates: weekDates, slots };
  }

  async listMyCourseEnrollments(studentUserId: string, tenantId: string) {
    await this.enrollmentSync.syncStudent(tenantId, studentUserId);
    await this.mentorSync.syncStudent(tenantId, studentUserId);

    const slot = await this.enrollmentSync.listValidCourseIdsForStudent(
      tenantId,
      studentUserId,
    );

    const rows = await this.courseEnrollments.find({
      where: {
        student_user_id: studentUserId,
        tenant_id: tenantId,
        status: In(['ENROLLED', 'COMPLETED']),
      },
      relations: ['course'],
      order: { semester: 'ASC' },
    });

    const filtered =
      slot.courseIds.length > 0
        ? rows.filter(
            (row) =>
              Number(row.semester) !== slot.semester ||
              slot.courseIds.includes(row.course_id),
          )
        : rows;

    return filtered.map((row) => this.toEnrollmentDto(row));
  }

  async listAvailableElectives(studentUserId: string, tenantId: string) {
    const existing = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId, tenant_id: tenantId },
    });
    const existingCourseIds = new Set(existing.map((row) => row.course_id));
    const electives = await this.courses.find({
      where: { tenant_id: tenantId, is_elective: true },
      order: { course_code: 'ASC' },
    });
    return electives.filter(
      (course) => !existingCourseIds.has(course.course_id),
    );
  }

  async registerCourses(
    studentUserId: string,
    tenantId: string,
    courseIds: string[],
  ) {
    const uniqueCourseIds = [...new Set(courseIds)].filter(Boolean);
    if (uniqueCourseIds.length === 0) return [];
    if (uniqueCourseIds.length > 2) {
      throw new BadRequestException(
        'You may register at most 2 electives per semester',
      );
    }

    const semesterRows = await this.courseEnrollments.manager.query<
      Array<{ semester: number }>
    >(
      `SELECT COALESCE(MAX(semester), 1) AS semester FROM student_course_enrollments WHERE student_user_id = $1`,
      [studentUserId],
    );
    const semester = Number(semesterRows[0]?.semester ?? 1);

    const electiveRows = await this.courseEnrollments
      .createQueryBuilder('e')
      .innerJoin('academic_courses', 'c', 'c.course_id = e.course_id')
      .where('e.student_user_id = :studentUserId', { studentUserId })
      .andWhere('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.semester = :semester', { semester })
      .andWhere(
        `COALESCE(c.course_type, CASE WHEN c.is_elective THEN 'ELECTIVE' ELSE 'CORE' END) = 'ELECTIVE'`,
      )
      .getCount();
    if (electiveRows + uniqueCourseIds.length > 2) {
      throw new BadRequestException('Maximum 2 electives allowed per semester');
    }

    const courses = await this.courses.find({
      where: {
        tenant_id: tenantId,
        course_id: In(uniqueCourseIds),
      },
    });

    const invalid = courses.filter(
      (c) =>
        (c as { course_type?: string }).course_type !== 'ELECTIVE' &&
        c.is_elective !== true,
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        'Only ELECTIVE courses can be self-registered',
      );
    }

    const existing = await this.courseEnrollments.find({
      where: {
        student_user_id: studentUserId,
        tenant_id: tenantId,
        course_id: In(uniqueCourseIds),
      },
    });
    const existingCourseIds = new Set(existing.map((row) => row.course_id));

    const rows = courses
      .filter((course) => !existingCourseIds.has(course.course_id))
      .map((course) =>
        this.courseEnrollments.create({
          tenant_id: tenantId,
          student_user_id: studentUserId,
          course_id: course.course_id,
          semester,
          status: 'ENROLLED',
          attendance_percent: '0.00',
        }),
      );

    if (rows.length === 0) return [];
    const saved = await this.courseEnrollments.save(rows);
    return this.courseEnrollments.find({
      where: { enrollment_id: In(saved.map((row) => row.enrollment_id)) },
      relations: ['course'],
      order: { semester: 'ASC' },
    });
  }

  async getHodDashboard(tenantId: string, hodUserId: string) {
    const center = await this.getHodCommandCenter(tenantId, hodUserId);
    return {
      faculty_present_today: center.health_metrics.faculty_present_today,
      total_faculty: center.health_metrics.total_faculty,
      total_students: center.health_metrics.total_students,
      average_department_attendance: center.health_metrics.average_attendance,
      pending_leave_approvals: center.health_metrics.pending_leave_count,
      pending_gate_pass_approvals:
        center.health_metrics.pending_gate_pass_count,
      pending_profile_corrections:
        center.health_metrics.pending_profile_corrections,
    };
  }

  async getHodCommandCenter(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.buildCommandCenterForDepartments(tenantId, hodUserId, deptIds);
  }

  async getDeanCommandCenter(tenantId: string, deanUserId: string) {
    const scope = await this.resolveDeanScope(deanUserId);
    const center = await this.buildCommandCenterForDepartments(
      tenantId,
      deanUserId,
      scope.departmentIds,
    );
    const [pendingEvents, hodCount] = await Promise.all([
      this.countPendingAdvisorEvents(tenantId),
      scope.departmentIds.length
        ? this.users.manager.query(
            `SELECT COUNT(DISTINCT hod_user_id)::int AS count
             FROM departments
             WHERE dept_id = ANY($1::int[]) AND hod_user_id IS NOT NULL`,
            [scope.departmentIds],
          )
        : Promise.resolve([{ count: 0 }]),
    ]);

    return {
      ...center,
      schools: scope.schools,
      department_count: scope.departmentIds.length,
      hod_count: hodCount[0]?.count ?? 0,
      pending_events_count: pendingEvents,
    };
  }

  async listDeanDepartments(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    if (!departmentIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT d.dept_id, d.dept_name,
              hod.name AS hod_name, hod.official_email AS hod_email,
              (SELECT COUNT(*)::int FROM users u
               INNER JOIN roles r ON r.role_id = u.role_id
               WHERE u.tenant_id = $1 AND u.dept_id = d.dept_id
                 AND r.role_name IN ('Faculty', 'HOD', 'Dean')) AS faculty_count,
              (SELECT COUNT(*)::int FROM users u
               INNER JOIN roles r ON r.role_id = u.role_id
               WHERE u.tenant_id = $1 AND u.dept_id = d.dept_id
                 AND r.role_name = 'Student') AS student_count,
              (SELECT COUNT(DISTINCT t.course_id)::int FROM academic_timetables t
               INNER JOIN users u ON u.user_id = t.faculty_user_id
               WHERE t.tenant_id = $1 AND u.dept_id = d.dept_id) AS active_courses,
              (SELECT COUNT(*)::int FROM academic_timetables t
               INNER JOIN users u ON u.user_id = t.faculty_user_id
               WHERE t.tenant_id = $1 AND u.dept_id = d.dept_id) AS timetable_slots
       FROM departments d
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       WHERE d.dept_id = ANY($2::int[])
       ORDER BY d.dept_name ASC`,
      [tenantId, departmentIds],
    );

    const riskRows = await this.users.manager.query(
      `SELECT u.dept_id,
              COUNT(*) FILTER (WHERE e.attendance_percent < 75)::int AS attendance_risk,
              COUNT(*) FILTER (WHERE e.grade_points IS NOT NULL AND e.grade_points < 4)::int AS result_risk
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       GROUP BY u.dept_id`,
      [tenantId, departmentIds],
    );
    const syllabusRows = await this.users.manager.query(
      `SELECT dept_id,
              ROUND(AVG(coverage_pct)::numeric, 1) AS avg_coverage,
              COUNT(*) FILTER (WHERE coverage_pct < 60)::int AS behind_count
       FROM (
         SELECT u.dept_id,
                CASE WHEN COUNT(*) > 0
                  THEN (COUNT(*) FILTER (WHERE m.status = 'COMPLETED')::float / COUNT(*)) * 100
                  ELSE 0 END AS coverage_pct
         FROM course_modules m
         INNER JOIN users u ON u.user_id = m.faculty_user_id
         WHERE m.tenant_id = $1 AND u.dept_id = ANY($2::int[])
         GROUP BY u.dept_id, m.course_id
       ) sub
       GROUP BY dept_id`,
      [tenantId, departmentIds],
    );
    const syllabusByDept = new Map<number, { avg: number; behind: number }>(
      syllabusRows.map(
        (row: {
          dept_id: number;
          avg_coverage: number;
          behind_count: number;
        }) => [
          Number(row.dept_id),
          {
            avg: Number(row.avg_coverage ?? 0),
            behind: Number(row.behind_count ?? 0),
          },
        ],
      ),
    );
    const riskByDept = new Map<
      number,
      { attendance_risk: number; result_risk: number }
    >(
      riskRows.map(
        (row: {
          dept_id: number;
          attendance_risk: number;
          result_risk: number;
        }) => [
          Number(row.dept_id),
          {
            attendance_risk: Number(row.attendance_risk ?? 0),
            result_risk: Number(row.result_risk ?? 0),
          },
        ],
      ),
    );

    return rows.map((row: Record<string, unknown>) => {
      const deptId = Number(row.dept_id);
      const cov = syllabusByDept.get(deptId) ?? { avg: 0, behind: 0 };
      const risk = riskByDept.get(deptId) ?? {
        attendance_risk: 0,
        result_risk: 0,
      };
      return {
        dept_id: deptId,
        dept_name: row.dept_name,
        hod_name: row.hod_name ?? null,
        hod_email: row.hod_email ?? null,
        faculty_count: Number(row.faculty_count ?? 0),
        student_count: Number(row.student_count ?? 0),
        active_courses: Number(row.active_courses ?? 0),
        timetable_slots: Number(row.timetable_slots ?? 0),
        syllabus_completion_pct: cov.avg,
        syllabus_behind_count: cov.behind,
        attendance_risk_count: risk.attendance_risk,
        result_risk_count: risk.result_risk,
      };
    });
  }

  async listDeanFacultyWorkload(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listFacultyWorkloadForDepartments(tenantId, departmentIds);
  }

  async listDeanDepartmentTimetable(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listDepartmentTimetableForDepartments(tenantId, departmentIds);
  }

  async listDeanCourseAllocationSlots(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    const [slots, faculty] = await Promise.all([
      this.listDepartmentTimetableForDepartments(tenantId, departmentIds),
      this.listDepartmentFacultyRaw(tenantId, departmentIds).then((rows) =>
        rows.map((row) => ({
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          department: row.department?.dept_name ?? null,
        })),
      ),
    ]);
    return { slots, faculty };
  }

  async listDeanSyllabusCoverage(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.fetchSyllabusCoverage(tenantId, departmentIds);
  }

  async listDeanResultAnalytics(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listResultAnalyticsForDepartments(tenantId, departmentIds);
  }

  async listDeanGrievances(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listGrievancesForDepartments(tenantId, departmentIds);
  }

  async listDeanSlowLearners(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listSlowLearnersForDepartments(tenantId, departmentIds);
  }

  async listDeanAppraisals(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listAppraisalsForDepartments(tenantId, departmentIds);
  }

  async listDeanStudents(
    tenantId: string,
    deanUserId: string,
    lowAttendance = false,
  ) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.listStudentsForDepartments(
      tenantId,
      departmentIds,
      lowAttendance,
    );
  }

  async listDeanInbox(tenantId: string, deanUserId: string) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.buildHodPendingInbox(tenantId, deanUserId, departmentIds);
  }

  private async buildCommandCenterForDepartments(
    tenantId: string,
    actorUserId: string,
    deptIds: number[],
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const todayDow = this.getIstDayOfWeek();
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);
    const facultyIds = faculty.map((row) => row.user_id);

    const [
      facultyPresentToday,
      totalStudents,
      facultyOnLeaveToday,
      classesScheduledToday,
      classesCancelledToday,
      classesRescheduledToday,
      attendanceTrend,
      syllabusCoverage,
      pendingInbox,
      attendanceDeficits,
      profileCorrectionRows,
    ] = await Promise.all([
      facultyIds.length
        ? this.staffAttendance
            .createQueryBuilder('attendance')
            .where('attendance.user_id IN (:...facultyIds)', { facultyIds })
            .andWhere('attendance.work_date = :today', { today })
            .andWhere('attendance.check_in_at IS NOT NULL')
            .getCount()
        : Promise.resolve(0),
      deptIds.length
        ? this.users
            .createQueryBuilder('user')
            .leftJoin('user.role', 'role')
            .where('user.tenant_id = :tenantId', { tenantId })
            .andWhere("role.role_name = 'Student'")
            .andWhere('user.dept_id IN (:...deptIds)', { deptIds })
            .getCount()
        : Promise.resolve(0),
      this.countFacultyOnLeaveToday(tenantId, facultyIds, today),
      this.countClassesScheduledToday(tenantId, facultyIds, todayDow),
      this.countClassAdjustmentsToday(tenantId, deptIds, today, 'CANCEL'),
      this.countClassAdjustmentsToday(tenantId, deptIds, today, 'RESCHEDULE'),
      this.computeDepartmentAttendanceTrend(tenantId, deptIds),
      this.fetchSyllabusCoverage(tenantId, deptIds),
      this.buildHodPendingInbox(tenantId, actorUserId, deptIds),
      this.listStudentsForDepartments(tenantId, deptIds, true).then((rows) =>
        rows.slice(0, 5),
      ),
      deptIds.length
        ? this.users.manager.query(
            `SELECT COUNT(*)::int AS count
             FROM helpdesk_tickets t
             INNER JOIN users u ON u.user_id = t.student_user_id
             WHERE u.tenant_id = $1
               AND u.dept_id = ANY($2::int[])
               AND t.category IN ('ACADEMICS', 'STUDENT_PROFILE')
               AND t.status = 'PENDING'`,
            [tenantId, deptIds],
          )
        : Promise.resolve([{ count: 0 }]),
    ]);

    const pendingLeaveCount = pendingInbox.filter(
      (row) => row.type === 'LEAVE',
    ).length;
    const pendingGatePassCount = pendingInbox.filter(
      (row) => row.type === 'GATE_PASS',
    ).length;

    return {
      health_metrics: {
        total_faculty: faculty.length,
        faculty_present_today: facultyPresentToday,
        faculty_on_leave_today: facultyOnLeaveToday,
        total_students: totalStudents,
        classes_scheduled_today: classesScheduledToday,
        classes_cancelled_today: classesCancelledToday,
        classes_rescheduled_today: classesRescheduledToday,
        average_attendance: attendanceTrend.current,
        attendance_trend_pct: attendanceTrend.delta,
        attendance_trend_label: attendanceTrend.label,
        pending_leave_count: pendingLeaveCount,
        pending_gate_pass_count: pendingGatePassCount,
        pending_profile_corrections: profileCorrectionRows[0]?.count ?? 0,
        pending_inbox_total: pendingInbox.length,
      },
      syllabus_coverage: syllabusCoverage,
      pending_inbox: pendingInbox,
      attendance_deficits: attendanceDeficits,
    };
  }

  async listHodFacultyWorkload(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listFacultyWorkloadForDepartments(tenantId, deptIds);
  }

  private async listFacultyWorkloadForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.dept_id,
              d.dept_name,
              hod.name AS hod_name,
              hod.official_email AS hod_email,
              COALESCE(SUM(
                EXTRACT(EPOCH FROM (t.end_time::time - t.start_time::time)) / 3600
              ), 0)::numeric(6,1) AS hours_per_week,
              COUNT(DISTINCT t.course_id)::int AS course_count
       FROM users u
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       LEFT JOIN academic_timetables t
         ON t.faculty_user_id = u.user_id AND t.tenant_id = u.tenant_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
       GROUP BY u.user_id, u.name, u.official_email, u.dept_id, d.dept_name, hod.name, hod.official_email
       ORDER BY d.dept_name ASC, hours_per_week DESC, u.name ASC`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      dept_id: row.dept_id,
      dept_name: row.dept_name,
      hod_name: row.hod_name,
      hod_email: row.hod_email,
      hours_per_week: Number(row.hours_per_week ?? 0),
      course_count: Number(row.course_count ?? 0),
      workload_status:
        Number(row.hours_per_week ?? 0) > 18
          ? 'OVERLOADED'
          : Number(row.hours_per_week ?? 0) < 6
            ? 'UNDERUTILIZED'
            : 'BALANCED',
    }));
  }

  async listHodSyllabusCoverage(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.fetchSyllabusCoverage(tenantId, deptIds);
  }

  async listHodDepartmentTimetable(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listDepartmentTimetableForDepartments(tenantId, deptIds);
  }

  private async listDepartmentTimetableForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time, t.room,
              c.course_id, c.course_code, c.course_name,
              u.user_id AS faculty_user_id, u.name AS faculty_name
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       INNER JOIN users u ON u.user_id = t.faculty_user_id
       WHERE t.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
       ORDER BY t.day_of_week ASC, t.start_time ASC, c.course_code ASC`,
      [tenantId, deptIds],
    );
  }

  async listHodCourseAllocationSlots(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const [slots, faculty] = await Promise.all([
      this.listDepartmentTimetableForDepartments(tenantId, deptIds),
      this.listDepartmentFacultyRaw(tenantId, deptIds).then((rows) =>
        rows.map((row) => ({
          user_id: row.user_id,
          name: row.name,
          email: row.email,
        })),
      ),
    ]);
    return { slots, faculty };
  }

  async getHodCourseAllocationTimetableData(
    tenantId: string,
    hodUserId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length)
      return { allocations: [], timetables: [], faculty: [] };

    const allocations = await this.users.manager.query(
      `SELECT a.allocation_id, a.semester, c.course_id, c.course_code, c.course_name,
              u.user_id AS faculty_user_id, u.name AS faculty_name
       FROM academic_course_allocations a
       INNER JOIN academic_courses c ON c.course_id = a.course_id
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       ORDER BY a.updated_at DESC NULLS LAST, c.course_code ASC`,
      [tenantId, deptIds],
    );

    const [timetables, faculty] = await Promise.all([
      this.listDepartmentTimetableForDepartments(tenantId, deptIds),
      this.listDepartmentFacultyRaw(tenantId, deptIds).then((rows) =>
        rows.map((row) => ({
          user_id: row.user_id,
          name: row.name,
          email: row.email,
        })),
      ),
    ]);

    return { allocations, timetables, faculty };
  }

  async saveHodCourseAllocationTimetableBatch(
    tenantId: string,
    hodUserId: string,
    dto: {
      semester: string;
      slots: Array<{
        course_id: string;
        faculty_user_id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>;
    },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) throw new Error('No departments found for HOD');

    await this.users.manager.transaction(async (manager) => {
      const allocations = await manager.query(
        `SELECT c.course_id, u.user_id as faculty_user_id
         FROM academic_course_allocations a
         INNER JOIN academic_courses c ON c.course_id = a.course_id
         INNER JOIN users u ON u.user_id = a.faculty_user_id
         WHERE a.tenant_id = $1 AND u.dept_id = ANY($2::int[]) AND a.semester = $3`,
        [tenantId, deptIds, dto.semester],
      );

      const courseIds = allocations.map((a: any) => a.course_id);
      if (!courseIds.length) return;

      await manager.query(
        `DELETE FROM academic_timetables
         WHERE tenant_id = $1 AND course_id = ANY($2::uuid[])`,
        [tenantId, courseIds],
      );

      if (dto.slots && dto.slots.length > 0) {
        for (const slot of dto.slots) {
          const valid = allocations.some(
            (a: any) =>
              a.course_id === slot.course_id &&
              a.faculty_user_id === slot.faculty_user_id,
          );
          if (valid) {
            await manager.query(
              `INSERT INTO academic_timetables (timetable_id, tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6)`,
              [
                tenantId,
                slot.course_id,
                slot.day_of_week,
                slot.start_time,
                slot.end_time,
                slot.faculty_user_id,
              ],
            );
          }
        }
      }
    });
    return { success: true };
  }

  async listHodResultAnalytics(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listResultAnalyticsForDepartments(tenantId, deptIds);
  }

  private async listResultAnalyticsForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT c.course_id, c.course_code, c.course_name,
              COUNT(*)::int AS enrolled,
              COUNT(*) FILTER (
                WHERE e.grade_points >= 4 OR e.status IN ('PASS', 'COMPLETED')
              )::int AS passed,
              COUNT(*) FILTER (
                WHERE e.grade_points IS NOT NULL AND e.grade_points < 4
              )::int AS failed
       FROM student_course_enrollments e
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       INNER JOIN users s ON s.user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND s.dept_id = ANY($2::int[])
       GROUP BY c.course_id, c.course_code, c.course_name
       ORDER BY c.course_code ASC`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => {
      const enrolled = Number(row.enrolled ?? 0);
      const passed = Number(row.passed ?? 0);
      const failed = Number(row.failed ?? 0);
      const graded = passed + failed;
      return {
        course_id: row.course_id as string,
        course_code: row.course_code,
        course_name: row.course_name,
        enrolled,
        passed,
        failed,
        pass_percent:
          graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0,
      };
    });
  }

  async listHodCourseStudents(
    tenantId: string,
    hodUserId: string,
    courseId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT u.user_id, u.name, u.official_email AS email, sp.enrollment_no,
              e.attendance_percent, e.grade_points, e.status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.tenant_id = $1 AND e.course_id = $2 AND u.dept_id = ANY($3::int[])
       ORDER BY u.name ASC`,
      [tenantId, courseId, deptIds],
    );
  }

  async listHodGrievances(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listGrievancesForDepartments(tenantId, deptIds);
  }

  private async listGrievancesForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT t.ticket_id, t.subject AS title, t.category, t.status, t.created_at, t.description,
              u.user_id AS student_user_id, u.name AS student_name, u.official_email AS student_email
       FROM helpdesk_tickets t
       INNER JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1
         AND t.category = 'ACADEMICS'
         AND t.status IN ('PENDING', 'IN_PROGRESS')
         AND u.dept_id = ANY($2::int[])
       ORDER BY t.created_at ASC`,
      [tenantId, deptIds],
    );
  }

  async listHodSlowLearners(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listSlowLearnersForDepartments(tenantId, deptIds);
  }

  private async listSlowLearnersForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT u.user_id, u.name, u.official_email AS email,
              ROUND(AVG(e.attendance_percent)::numeric, 1) AS average_attendance,
              ROUND(AVG(e.grade_points)::numeric, 2) AS average_grade_points,
              COUNT(*)::int AS course_count,
              COUNT(*) FILTER (WHERE e.attendance_percent < 60)::int AS low_attendance_courses,
              COUNT(*) FILTER (WHERE e.grade_points IS NOT NULL AND e.grade_points < 4)::int AS failing_courses
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       GROUP BY u.user_id, u.name, u.official_email
       HAVING AVG(e.attendance_percent) < 75 OR AVG(e.grade_points) < 5
       ORDER BY average_attendance ASC NULLS LAST, average_grade_points ASC NULLS LAST
       LIMIT 50`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      average_attendance: Number(row.average_attendance ?? 0),
      average_grade_points:
        row.average_grade_points === null
          ? null
          : Number(row.average_grade_points),
      course_count: Number(row.course_count ?? 0),
      low_attendance_courses: Number(row.low_attendance_courses ?? 0),
      failing_courses: Number(row.failing_courses ?? 0),
    }));
  }

  async listHodAppraisals(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listAppraisalsForDepartments(tenantId, deptIds);
  }

  private async listAppraisalsForDepartments(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT a.appraisal_record_id, a.appraisal_year, a.auto_api_score, a.hod_rating, a.hr_final_status,
              u.user_id, u.name, u.official_email AS email
       FROM hr_employee_appraisals a
       INNER JOIN users u ON u.user_id = a.user_id
       WHERE a.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND a.hr_final_status IN ('HOD_REVIEW', 'PENDING')
       ORDER BY a.appraisal_year DESC, u.name ASC`,
      [tenantId, deptIds],
    );
  }

  async submitHodAppraisalRating(
    tenantId: string,
    hodUserId: string,
    appraisalId: string,
    hodRating: number,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const [row] = await this.users.manager.query(
      `SELECT a.appraisal_record_id, u.dept_id
       FROM hr_employee_appraisals a
       INNER JOIN users u ON u.user_id = a.user_id
       WHERE a.appraisal_record_id = $1 AND a.tenant_id = $2`,
      [appraisalId, tenantId],
    );
    if (!row || !deptIds.includes(Number(row.dept_id))) {
      throw new NotFoundException(
        'Appraisal not found in your department scope',
      );
    }
    if (hodRating < 0 || hodRating > 5) {
      throw new Error('HOD rating must be between 0 and 5');
    }

    await this.users.manager.query(
      `UPDATE hr_employee_appraisals
       SET hod_rating = $1, hr_final_status = 'HR_APPROVED'
       WHERE appraisal_record_id = $2 AND tenant_id = $3`,
      [hodRating, appraisalId, tenantId],
    );
    return {
      appraisal_record_id: appraisalId,
      hod_rating: hodRating,
      hr_final_status: 'HR_APPROVED',
    };
  }

  private async countFacultyOnLeaveToday(
    tenantId: string,
    facultyIds: string[],
    today: string,
  ) {
    if (!facultyIds.length) return 0;
    const [row] = await this.users.manager.query(
      `SELECT COUNT(DISTINCT staff_user_id)::int AS count
       FROM staff_leave_requests
       WHERE tenant_id = $1
         AND staff_user_id = ANY($2::uuid[])
         AND status IN ('PENDING', 'HOD_APPROVED', 'HR_APPROVED')
         AND start_date::date <= $3::date
         AND end_date::date >= $3::date`,
      [tenantId, facultyIds, today],
    );
    return Number(row?.count ?? 0);
  }

  private async countClassesScheduledToday(
    tenantId: string,
    facultyIds: string[],
    dayOfWeek: number,
  ) {
    if (!facultyIds.length) return 0;
    const [row] = await this.users.manager.query(
      `SELECT COUNT(*)::int AS count
       FROM academic_timetables
       WHERE tenant_id = $1
         AND faculty_user_id = ANY($2::uuid[])
         AND day_of_week = $3`,
      [tenantId, facultyIds, dayOfWeek],
    );
    return Number(row?.count ?? 0);
  }

  private async countClassAdjustmentsToday(
    tenantId: string,
    deptIds: number[],
    today: string,
    kind: 'CANCEL' | 'RESCHEDULE',
  ) {
    if (!deptIds.length) return 0;
    const typeClause =
      kind === 'CANCEL'
        ? `a.adjustment_type = 'CANCEL'`
        : `a.adjustment_type IN ('EXTRA_CLASS', 'SUBSTITUTE')`;
    const [row] = await this.users.manager.query(
      `SELECT COUNT(*)::int AS count
       FROM class_adjustments a
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND ${typeClause}
         AND (
           (a.original_date IS NOT NULL AND a.original_date::date = $3::date)
           OR (a.new_date IS NOT NULL AND a.new_date::date = $3::date)
         )
         AND a.status IN ('PENDING_HOD_APPROVAL', 'APPROVED', 'NOTIFIED')`,
      [tenantId, deptIds, today],
    );
    return Number(row?.count ?? 0);
  }

  private async computeDepartmentAttendanceTrend(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) {
      return { current: 0, delta: 0, label: 'No department data' };
    }

    const enrollments = await this.courseEnrollments
      .createQueryBuilder('enrollment')
      .leftJoin('enrollment.student', 'student')
      .where('enrollment.tenant_id = :tenantId', { tenantId })
      .andWhere('student.dept_id IN (:...deptIds)', { deptIds })
      .getMany();

    const current =
      enrollments.length > 0
        ? Number(
            (
              enrollments.reduce(
                (sum, row) => sum + Number(row.attendance_percent ?? 0),
                0,
              ) / enrollments.length
            ).toFixed(1),
          )
        : 0;

    const trendRows = await this.users.manager.query(
      `SELECT
         ROUND(AVG(CASE WHEN ar.session_date >= CURRENT_DATE - 7 THEN
           CASE WHEN ar.status IN ('PRESENT', 'LATE', 'EXCUSED') THEN 100 ELSE 0 END END)::numeric, 1) AS this_week,
         ROUND(AVG(CASE WHEN ar.session_date >= CURRENT_DATE - 14 AND ar.session_date < CURRENT_DATE - 7 THEN
           CASE WHEN ar.status IN ('PRESENT', 'LATE', 'EXCUSED') THEN 100 ELSE 0 END END)::numeric, 1) AS last_week
       FROM academic_attendance_records ar
       INNER JOIN users u ON u.user_id = ar.student_user_id
       WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])`,
      [tenantId, deptIds],
    );

    const thisWeek = Number(trendRows[0]?.this_week ?? current);
    const lastWeek = Number(trendRows[0]?.last_week ?? thisWeek);
    const delta = Number((thisWeek - lastWeek).toFixed(1));
    const sign = delta >= 0 ? '+' : '';
    return {
      current: thisWeek || current,
      delta,
      label: `${sign}${delta}% from last week`,
    };
  }

  private async fetchSyllabusCoverage(tenantId: string, deptIds: number[]) {
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT c.course_id, c.course_code, c.course_name, u.name AS faculty_name,
              COUNT(*)::int AS total_modules,
              COUNT(*) FILTER (WHERE m.status = 'COMPLETED')::int AS completed_modules,
              MAX(
                CASE
                  WHEN m.planned_completion_date IS NOT NULL
                    AND m.status != 'COMPLETED'
                    AND m.planned_completion_date < CURRENT_DATE
                  THEN (CURRENT_DATE - m.planned_completion_date)
                  ELSE 0
                END
              )::int AS days_behind
       FROM course_modules m
       INNER JOIN academic_courses c ON c.course_id = m.course_id
       INNER JOIN users u ON u.user_id = m.faculty_user_id
       WHERE m.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       GROUP BY c.course_id, c.course_code, c.course_name, u.user_id, u.name
       ORDER BY days_behind DESC NULLS LAST, c.course_code ASC
       LIMIT 12`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => {
      const total = Number(row.total_modules ?? 0);
      const completed = Number(row.completed_modules ?? 0);
      const percent =
        total > 0 ? Number(((completed / total) * 100).toFixed(0)) : 0;
      const daysBehind = Number(row.days_behind ?? 0);
      return {
        course_id: row.course_id as string,
        course_code: row.course_code,
        course_name: row.course_name,
        faculty_name: row.faculty_name,
        completed_modules: completed,
        total_modules: total,
        coverage_percent: percent,
        behind_schedule: percent < 60 || daysBehind > 0,
        days_behind: daysBehind,
      };
    });
  }

  private async buildHodPendingInbox(
    tenantId: string,
    hodUserId: string,
    deptIds: number[],
  ) {
    const [leaves, gatePasses, adjustments] = await Promise.all([
      this.listHodLeaveApprovals(tenantId, hodUserId),
      this.listHodGatePassApprovals(tenantId, hodUserId),
      deptIds.length
        ? this.users.manager.query(
            `SELECT a.adjustment_id, a.adjustment_type, a.original_date, a.new_date, a.reason, a.created_at,
                    c.course_code, u.name AS faculty_name
             FROM class_adjustments a
             INNER JOIN academic_courses c ON c.course_id = a.course_id
             INNER JOIN users u ON u.user_id = a.faculty_user_id
             WHERE a.tenant_id = $1 AND a.status = 'PENDING_HOD_APPROVAL'
               AND u.dept_id = ANY($2::int[])
             ORDER BY a.created_at ASC`,
            [tenantId, deptIds],
          )
        : Promise.resolve([]),
    ]);

    const inbox: Array<{
      id: string;
      type: string;
      title: string;
      employee_name: string;
      date_label: string;
      detail: string;
      created_at: string;
    }> = [];

    for (const leave of leaves) {
      inbox.push({
        id: leave.leave_id,
        type: 'LEAVE',
        title: `${leave.leave_type} Leave`,
        employee_name: leave.staff?.name ?? 'Faculty',
        date_label: `${leave.start_date} → ${leave.end_date}`,
        detail: leave.reason ?? '—',
        created_at:
          leave.applied_at?.toISOString?.() ?? new Date().toISOString(),
      });
    }

    for (const pass of gatePasses) {
      inbox.push({
        id: pass.pass_id,
        type: 'GATE_PASS',
        title: 'Gate Pass',
        employee_name: pass.staff?.name ?? 'Faculty',
        date_label: pass.out_time
          ? new Date(pass.out_time).toLocaleString('en-IN')
          : '—',
        detail: pass.reason ?? '—',
        created_at: pass.out_time?.toISOString?.() ?? new Date().toISOString(),
      });
    }

    for (const adj of adjustments as Array<Record<string, unknown>>) {
      const adjType = String(adj.adjustment_type ?? 'EXTRA_CLASS');
      inbox.push({
        id: String(adj.adjustment_id),
        type: adjType === 'CANCEL' ? 'CANCEL' : 'EXTRA_CLASS',
        title:
          adjType === 'CANCEL'
            ? 'Class Cancellation'
            : 'Extra / Substitute Class',
        employee_name: String(adj.faculty_name ?? 'Faculty'),
        date_label: adj.new_date
          ? new Date(String(adj.new_date)).toLocaleDateString('en-IN')
          : adj.original_date
            ? new Date(String(adj.original_date)).toLocaleDateString('en-IN')
            : '—',
        detail: `${adj.course_code}: ${adj.reason ?? '—'}`,
        created_at: String(adj.created_at ?? new Date().toISOString()),
      });
    }

    return inbox.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  async listHodFacultyRoster(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);

    // Fetch HOD's own name so frontend can show "Reports to: <HOD name>"
    const hod = await this.users.findOne({ where: { user_id: hodUserId } });

    const facultyIds = faculty.map((row) => row.user_id);
    const profileByUser = new Map<
      string,
      {
        employee_id: string | null;
        designation: string | null;
        joining_date: string | null;
        shift_timing: string | null;
        reports_to_name: string | null;
      }
    >();
    if (facultyIds.length > 0) {
      const profileRows = await this.users.manager.query<
        Array<{
          user_id: string;
          employee_id: string | null;
          designation: string | null;
          joining_date: string | null;
          start_time: string | null;
          end_time: string | null;
          reports_to_name: string | null;
        }>
      >(
        `SELECT ep.user_id, ep.employee_id, ep.designation, ep.joining_date::text,
                s.start_time::text, s.end_time::text,
                ro.name AS reports_to_name
         FROM hr_employee_profiles ep
         LEFT JOIN hr_shifts s ON s.shift_id = ep.shift_id
         LEFT JOIN users u ON u.user_id = ep.user_id AND u.tenant_id = ep.tenant_id
         LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
         WHERE ep.tenant_id = $1 AND ep.user_id = ANY($2::uuid[])`,
        [tenantId, facultyIds],
      );
      for (const row of profileRows) {
        const start = row.start_time?.slice(0, 5) ?? '09:00';
        const end = row.end_time?.slice(0, 5) ?? '17:00';
        profileByUser.set(row.user_id, {
          employee_id: row.employee_id,
          designation: row.designation,
          joining_date: row.joining_date,
          shift_timing: `${start} - ${end}`,
          reports_to_name: row.reports_to_name,
        });
      }
    }

    const allocations =
      facultyIds.length === 0
        ? []
        : await this.timetables.find({
            where: { tenant_id: tenantId, faculty_user_id: In(facultyIds) },
            relations: ['course'],
            order: { day_of_week: 'ASC', start_time: 'ASC' },
          });

    return faculty.map((row) => {
      const profile = profileByUser.get(row.user_id);
      return {
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        entity_id: row.entity_id ?? null,
        department: row.department?.dept_name ?? null,
        role: row.role?.role_name ?? null,
        designation: profile?.designation ?? row.role?.role_name ?? null,
        reporting_officer_id: row.reporting_officer_id ?? null,
        reports_to_name: profile?.reports_to_name ?? hod?.name ?? null,
        hod_name: hod?.name ?? null,
        joined_at: profile?.joining_date ?? row.created_at ?? null,
        shift_timing: profile?.shift_timing ?? null,
        employee_id: profile?.employee_id ?? null,
        courses: allocations
          .filter((allocation) => allocation.faculty_user_id === row.user_id)
          .map((allocation) => ({
            timetable_id: allocation.timetable_id,
            course_id: allocation.course_id,
            course_code: allocation.course?.course_code,
            course_name: allocation.course?.course_name,
            day_of_week: allocation.day_of_week,
            start_time: allocation.start_time,
            end_time: allocation.end_time,
            room: allocation.room,
          })),
      };
    });
  }

  private parseSemester(semStr: string | null, courseCode?: string): number {
    if (semStr) {
      const upper = semStr.toUpperCase();
      if (upper.startsWith('VIII')) return 8;
      if (upper.startsWith('VII')) return 7;
      if (upper.startsWith('VI')) return 6;
      if (upper.startsWith('V')) return 5;
      if (upper.startsWith('IV')) return 4;
      if (upper.startsWith('III')) return 3;
      if (upper.startsWith('II')) return 2;
      if (upper.startsWith('I')) return 1;
    }
    if (courseCode) {
      const match = courseCode.match(/\d/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num >= 1 && num <= 8) return num;
      }
    }
    return 3; // Default fallback
  }

  async getHodFacultyAudit(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);
    const facultyIds = faculty.map((row) => row.user_id);
    if (facultyIds.length === 0) return [];

    const allocations = await this.timetables.find({
      where: { tenant_id: tenantId, faculty_user_id: In(facultyIds) },
      relations: ['course'],
      order: { day_of_week: 'ASC', start_time: 'ASC' },
    });

    const courseAllocations = await this.users.manager.query(
      `SELECT course_id, faculty_user_id, semester 
       FROM academic_course_allocations 
       WHERE tenant_id = $1 AND faculty_user_id = ANY($2::uuid[])`,
      [tenantId, facultyIds],
    );

    const semesterMap = new Map<string, string>();
    for (const row of courseAllocations) {
      if (row.course_id && row.faculty_user_id) {
        semesterMap.set(
          `${row.faculty_user_id}_${row.course_id}`,
          row.semester || '',
        );
      }
    }

    const materialsCounts = await this.users.manager.query(
      `SELECT course_id, COUNT(*)::int AS count 
       FROM course_materials 
       WHERE tenant_id = $1 AND faculty_user_id = ANY($2::uuid[]) 
       GROUP BY course_id`,
      [tenantId, facultyIds],
    );
    const materialsMap = new Map<string, number>(
      materialsCounts.map((r: any) => [r.course_id, Number(r.count)]),
    );

    const isoDay = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const missingAttendanceRows = await this.users.manager.query(
      `SELECT 
         t.faculty_user_id,
         t.course_id,
         c.course_code,
         t.start_time,
         t.end_time
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       LEFT JOIN course_attendance_logs cal
         ON cal.tenant_id = t.tenant_id
        AND cal.course_id = t.course_id
        AND cal.faculty_user_id = t.faculty_user_id
        AND cal.date = CURRENT_DATE
        AND cal.timetable_id = t.timetable_id
       WHERE t.tenant_id = $1
         AND t.faculty_user_id = ANY($2::uuid[])
         AND t.day_of_week = $3
         AND t.end_time < CURRENT_TIME
         AND cal.log_id IS NULL`,
      [tenantId, facultyIds, isoDay],
    );

    const missingAttendanceMap = new Map<string, string[]>();
    for (const row of missingAttendanceRows) {
      if (!missingAttendanceMap.has(row.faculty_user_id)) {
        missingAttendanceMap.set(row.faculty_user_id, []);
      }
      missingAttendanceMap
        .get(row.faculty_user_id)!
        .push(`${row.course_code} at ${row.start_time} (Today)`);
    }

    const courseIds = allocations.map((a) => a.course_id);
    const [conductedRows, slotRows] = await Promise.all([
      this.users.manager.query(
        `SELECT faculty_user_id, course_id, COUNT(*)::int AS conducted
         FROM course_attendance_logs
         WHERE tenant_id = $1 AND faculty_user_id = ANY($2::uuid[])
         GROUP BY faculty_user_id, course_id`,
        [tenantId, facultyIds],
      ),
      this.users.manager.query(
        `SELECT faculty_user_id, course_id, COUNT(*)::int AS weekly_slots
         FROM academic_timetables
         WHERE tenant_id = $1 AND faculty_user_id = ANY($2::uuid[])
         GROUP BY faculty_user_id, course_id`,
        [tenantId, facultyIds],
      ),
    ]);
    const conductedMap = new Map<string, number>(
      conductedRows.map((r: { faculty_user_id: string; course_id: string; conducted: number }) => [
        `${r.faculty_user_id}_${r.course_id}`,
        Number(r.conducted),
      ]),
    );
    const slotMap = new Map<string, number>(
      slotRows.map((r: { faculty_user_id: string; course_id: string; weekly_slots: number }) => [
        `${r.faculty_user_id}_${r.course_id}`,
        Number(r.weekly_slots),
      ]),
    );

    const marksStatuses = courseIds.length > 0
      ? await this.users.manager.query(
          `SELECT course_id, exam_type, COUNT(*)::int AS count, MIN(status) AS min_status
           FROM academic_marks 
           WHERE tenant_id = $1 AND course_id = ANY($2::uuid[]) 
           GROUP BY course_id, exam_type`,
            [tenantId, courseIds],
          )
        : [];

    const marksMap = new Map<
      string,
      {
        ga: boolean;
        wt: boolean;
        labs: boolean;
        theory: boolean;
        status: string;
      }
    >();
    for (const r of marksStatuses) {
      if (!marksMap.has(r.course_id)) {
        marksMap.set(r.course_id, {
          ga: false,
          wt: false,
          labs: false,
          theory: false,
          status: 'OPEN',
        });
      }
      const m = marksMap.get(r.course_id)!;
      const type = r.exam_type.toUpperCase();
      if (Number(r.count) > 0) {
        if (
          type.startsWith('GA') ||
          type.startsWith('DA') ||
          type === 'INTERNAL' ||
          type === 'QUIZ' ||
          type === 'PROJECT' ||
          type === 'ASSIGNMENT'
        ) {
          m.ga = true;
        }
        if (
          type.startsWith('WT') ||
          type.startsWith('CAT') ||
          type.startsWith('MTE') ||
          type === 'MID_TERM'
        ) {
          m.wt = true;
        }
        if (type.includes('LAB') || type.includes('PRACTICAL')) {
          m.labs = true;
        }
        if (type === 'ETE' || type === 'END_TERM' || type === 'THEORY') {
          m.theory = true;
        }
      }
      // Overall status is only LOCKED when the final ETE (theory/labs) is locked/published
      if (type === 'ETE' || type === 'END_TERM' || type === 'THEORY') {
        if (
          r.min_status === 'LOCKED' ||
          r.min_status === 'PUBLISHED' ||
          r.min_status === 'PENDING_COE'
        ) {
          m.status = 'LOCKED';
        } else if (r.min_status === 'EDIT_REQUESTED') {
          m.status = 'EDIT_REQUESTED';
        }
      }
    }

    const auditRecords: any[] = [];
    for (const fac of faculty) {
      const facAllocations = allocations.filter(
        (a) => a.faculty_user_id === fac.user_id,
      );
      const seenCourses = new Set<string>();

      if (facAllocations.length === 0) {
        auditRecords.push({
          id: `a-${fac.user_id}-none`,
          facultyName: fac.name,
          facultyId: fac.user_id,
          semester: 3, // default/fallback
          subjectCode: 'N/A',
          subjectName: 'No Course Allocated',
          pptsUploaded: 0,
          attendanceMarked: 100,
          attendanceMissingClasses: [],
          attendanceStatusLabel: 'N/A',
          marksUploaded: { ga: false, wt: false, labs: false, theory: false },
          marksStatus: 'N/A',
          editRequestReason: '',
        });
        continue;
      }

      for (const alloc of facAllocations) {
        if (seenCourses.has(alloc.course_id)) continue;
        seenCourses.add(alloc.course_id);

        const courseId = alloc.course_id;
        const ppts = materialsMap.get(courseId) ?? 0;
        const missing = missingAttendanceMap.get(fac.user_id) ?? [];

        const semStr = semesterMap.get(`${fac.user_id}_${courseId}`) || '';
        const semester = this.parseSemester(semStr, alloc.course?.course_code);

        // Find if this specific course has a class scheduled today
        const todaySlots = facAllocations.filter(
          (a) => a.course_id === courseId && a.day_of_week === isoDay,
        );
        let attendanceStatusLabel:
          | 'All Marked'
          | 'Missed Class'
          | 'No Class Today'
          | 'Upcoming Class' = 'No Class Today';

        if (todaySlots.length > 0) {
          const pad = (n: number) => String(n).padStart(2, '0');
          const now = new Date();
          const currentTimeString = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

          const endedSlots = todaySlots.filter(
            (a) => a.end_time < currentTimeString,
          );
          if (endedSlots.length === 0) {
            attendanceStatusLabel = 'Upcoming Class';
          } else {
            const hasMissingForCourse = missing.some((m) =>
              m.startsWith(alloc.course?.course_code || ''),
            );
            if (hasMissingForCourse) {
              attendanceStatusLabel = 'Missed Class';
            } else {
              attendanceStatusLabel = 'All Marked';
            }
          }
        }

        const marks = marksMap.get(courseId) ?? { ga: false, wt: false, labs: false, theory: false, status: 'OPEN' };
        const classesConducted = conductedMap.get(`${fac.user_id}_${courseId}`) ?? 0;
        const weeklySlots = slotMap.get(`${fac.user_id}_${courseId}`) ?? 0;
        const totalClasses = weeklySlots > 0 ? weeklySlots * 15 : Math.max(35, classesConducted);

        auditRecords.push({
          id: `a-${fac.user_id}-${courseId}`,
          facultyName: fac.name,
          facultyId: fac.user_id,
          semester,
          subjectCode: alloc.course?.course_code || 'N/A',
          subjectName: alloc.course?.course_name || 'N/A',
          pptsUploaded: ppts,
          totalClasses,
          classesConducted,
          attendanceMarked:
            totalClasses > 0
              ? Math.min(100, Math.round((classesConducted / totalClasses) * 100))
              : 0,
          attendanceMissingClasses: missing.filter((m) => m.startsWith(alloc.course?.course_code || '')),
          attendanceStatusLabel,
          marksUploaded: {
            ga: marks.ga,
            wt: marks.wt,
            labs: marks.labs,
            theory: marks.theory,
          },
          marksStatus: marks.status,
          editRequestReason:
            marks.status === 'EDIT_REQUESTED'
              ? 'Requesting unlock to submit revised grades.'
              : '',
        });
      }
    }

    return auditRecords;
  }

  async notifyFacultyMissingAttendance(
    tenantId: string,
    hodUserId: string,
    dto: {
      faculty_user_id: string;
      subject_code: string;
      missing_classes: string[];
    },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.users.findOne({
      where: { user_id: dto.faculty_user_id, tenant_id: tenantId },
    });
    if (!faculty) {
      throw new NotFoundException('Faculty member not found');
    }
    if (faculty.dept_id != null && !deptIds.includes(faculty.dept_id)) {
      throw new ForbiddenException('Faculty is not in your department');
    }

    const hod = await this.users.findOne({ where: { user_id: hodUserId } });
    const slots =
      dto.missing_classes.length > 0
        ? dto.missing_classes.join('; ')
        : 'scheduled classes today';

    this.notify.approvalRequired({
      tenantId,
      userId: dto.faculty_user_id,
      title: 'Pending student attendance logs',
      message: `${hod?.name ?? 'HOD'} flagged pending attendance for ${dto.subject_code}: ${slots}. Please complete marking within 24 hours.`,
      actionLink: '/faculty/attendance',
      category: 'ACADEMICS',
      requesterName: hod?.name ?? 'HOD',
      requestType: 'Attendance compliance',
    });

    return { success: true };
  }

  async handleHodUnlockAction(
    tenantId: string,
    hodUserId: string,
    dto: { course_id: string; action: 'APPROVE' | 'REJECT' },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const targetStatus = dto.action === 'APPROVE' ? 'DRAFT' : 'PUBLISHED';

    await this.users.manager.query(
      `UPDATE academic_marks 
       SET status = $1 
       WHERE tenant_id = $2 AND course_id = $3 AND status = 'EDIT_REQUESTED'`,
      [targetStatus, tenantId, dto.course_id],
    );

    return {
      success: true,
      message: `Request successfully ${dto.action.toLowerCase()}d.`,
    };
  }

  async allocateHodCourse(
    tenantId: string,
    hodUserId: string,
    dto: {
      timetable_id: string;
      faculty_user_id: string;
      day_of_week?: number;
      start_time?: string;
      end_time?: string;
      course_id?: string;
    },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.users.findOne({
      where: { user_id: dto.faculty_user_id, tenant_id: tenantId },
      relations: ['role'],
    });
    if (!faculty || !deptIds.includes(faculty.dept_id)) {
      throw new Error('Faculty member is outside this HOD department scope');
    }

    const updatePayload: any = { faculty_user_id: dto.faculty_user_id };
    if (dto.day_of_week !== undefined)
      updatePayload.day_of_week = dto.day_of_week;
    if (dto.start_time !== undefined) updatePayload.start_time = dto.start_time;
    if (dto.end_time !== undefined) updatePayload.end_time = dto.end_time;

    let slot;
    if (dto.timetable_id) {
      if (dto.timetable_id.startsWith('draft-')) {
        if (
          !dto.course_id ||
          dto.day_of_week === undefined ||
          !dto.start_time ||
          !dto.end_time
        ) {
          throw new Error('Missing required fields for new timetable slot');
        }
        const insertResult = await this.users.manager.query(
          `INSERT INTO academic_timetables (timetable_id, tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6)
           RETURNING *`,
          [
            tenantId,
            dto.course_id,
            dto.day_of_week,
            dto.start_time,
            dto.end_time,
            dto.faculty_user_id,
          ],
        );
        slot = insertResult[0];
      } else {
        await this.timetables.update(
          { timetable_id: dto.timetable_id, tenant_id: tenantId },
          updatePayload,
        );
        slot = await this.timetables.findOne({
          where: { timetable_id: dto.timetable_id, tenant_id: tenantId },
          relations: ['course', 'faculty'],
        });
      }
    }

    if (slot) {
      await this.users.manager.query(
        `DELETE FROM academic_timetables d
         USING academic_timetables keeper
         WHERE keeper.timetable_id = $1
           AND d.tenant_id = keeper.tenant_id
           AND d.course_id = keeper.course_id
           AND d.day_of_week = keeper.day_of_week
           AND d.start_time = keeper.start_time
           AND d.end_time = keeper.end_time
           AND d.timetable_id <> keeper.timetable_id
           AND d.deleted_at IS NULL`,
        [slot.timetable_id],
      );
    }

    const courseIdToUpdate = slot?.course_id || dto.course_id;
    if (courseIdToUpdate) {
      await this.users.manager.query(
        `UPDATE academic_course_allocations
            SET faculty_user_id = $3, updated_at = NOW()
          WHERE tenant_id = $1
            AND course_id = $2
            AND status = 'ACTIVE'`,
        [tenantId, courseIdToUpdate, dto.faculty_user_id],
      );
    }
    if (slot?.course_id) {
      await this.notifyCourseStudents(
        tenantId,
        slot.course_id,
        slot.course?.course_name ?? 'Course',
        `Faculty assignment updated for this slot.`,
      );
    }
    if (dto.faculty_user_id) {
      this.notify.timetableChanged({
        tenantId,
        userId: dto.faculty_user_id,
        courseName: slot?.course?.course_name ?? 'Course',
        changeSummary: 'You have been assigned to teach this slot.',
        actionLink: '/faculty/timetable',
      });
    }
    return slot;
  }

  async updateTimetableSlot(
    tenantId: string,
    timetableId: string,
    dto: {
      day_of_week?: number;
      start_time?: string;
      end_time?: string;
      room?: string;
      cancelled?: boolean;
    },
  ) {
    const slot = await this.timetables.findOne({
      where: { timetable_id: timetableId, tenant_id: tenantId },
      relations: ['course'],
    });
    if (!slot) throw new NotFoundException('Timetable slot not found');

    if (dto.day_of_week !== undefined) slot.day_of_week = dto.day_of_week;
    if (dto.start_time !== undefined) slot.start_time = dto.start_time;
    if (dto.end_time !== undefined) slot.end_time = dto.end_time;
    if (dto.room !== undefined) slot.room = dto.room;
    const saved = await this.timetables.save(slot);

    const summary = dto.cancelled
      ? 'Class cancelled for this slot.'
      : `Rescheduled to ${saved.day_of_week} ${saved.start_time}–${saved.end_time}${saved.room ? ` (${saved.room})` : ''}.`;

    await this.notifyCourseStudents(
      tenantId,
      saved.course_id,
      slot.course?.course_name ?? 'Course',
      summary,
    );
    if (saved.faculty_user_id) {
      this.notify.timetableChanged({
        tenantId,
        userId: saved.faculty_user_id,
        courseName: slot.course?.course_name ?? 'Course',
        changeSummary: summary,
        actionLink: '/faculty/timetable',
      });
    }
    return saved;
  }

  async listHodStudents(
    tenantId: string,
    hodUserId: string,
    lowAttendance = false,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.listStudentsForDepartments(tenantId, deptIds, lowAttendance);
  }

  private async listStudentsForDepartments(
    tenantId: string,
    deptIds: number[],
    lowAttendance = false,
  ) {
    const students = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere("role.role_name = 'Student'")
      .andWhere(deptIds.length ? 'user.dept_id IN (:...deptIds)' : '1=1', {
        deptIds,
      })
      .orderBy('user.name', 'ASC')
      .getMany();

    const studentIds = students.map((row) => row.user_id);
    const enrollments =
      studentIds.length === 0
        ? []
        : await this.courseEnrollments.find({
            where: { tenant_id: tenantId, student_user_id: In(studentIds) },
            relations: ['course'],
            order: { semester: 'DESC' },
          });

    return students
      .map((student) => {
        const rows = enrollments.filter(
          (row) => row.student_user_id === student.user_id,
        );
        const attendance =
          rows.length > 0
            ? Number(
                (
                  rows.reduce(
                    (sum, row) => sum + Number(row.attendance_percent),
                    0,
                  ) / rows.length
                ).toFixed(2),
              )
            : 0;
        const completed = rows.filter(
          (row) => row.status === 'COMPLETED' && row.grade_points !== null,
        );
        const weightedGradePoints = completed.reduce(
          (sum, row) => sum + Number(row.grade_points) * row.course.credits,
          0,
        );
        const creditsCompleted = completed.reduce(
          (sum, row) => sum + row.course.credits,
          0,
        );
        const cgpa =
          creditsCompleted > 0
            ? Number((weightedGradePoints / creditsCompleted).toFixed(2))
            : 0;

        return {
          user_id: student.user_id,
          name: student.name,
          email: student.email,
          department: student.department?.dept_name ?? null,
          average_attendance: attendance,
          course_count: rows.length,
          low_attendance: attendance < 75,
          cgpa,
          enrollment_year: student.created_at
            ? new Date(student.created_at).getFullYear()
            : new Date().getFullYear(),
        };
      })
      .filter((student) => !lowAttendance || student.low_attendance);
  }

  async getDeanStudentDetail(
    tenantId: string,
    deanUserId: string,
    studentUserId: string,
  ) {
    const { departmentIds } = await this.resolveDeanScope(deanUserId);
    return this.fetchStudentDetailForDepartments(
      tenantId,
      departmentIds,
      studentUserId,
    );
  }

  async getHodStudentDetail(
    tenantId: string,
    hodUserId: string,
    studentUserId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.fetchStudentDetailForDepartments(
      tenantId,
      deptIds,
      studentUserId,
    );
  }

  private async fetchStudentDetailForDepartments(
    tenantId: string,
    deptIds: number[],
    studentUserId: string,
  ) {
    const student = await this.users.findOne({
      where: { user_id: studentUserId, tenant_id: tenantId },
      relations: ['department', 'role'],
    });

    if (!student || student.role?.role_name !== 'Student') {
      throw new NotFoundException('Student not found');
    }
    if (deptIds.length && !deptIds.includes(student.dept_id)) {
      throw new NotFoundException('Student is not in your department scope');
    }

    const historyRows = await this.users.manager.query(
      `SELECT semester,
              AVG(attendance_percent)::numeric(5,2) AS attendance,
              SUM(grade_points * c.credits) / NULLIF(SUM(c.credits), 0) AS cgpa
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
         AND e.status IN ('COMPLETED', 'PASS', 'FAILED')
       GROUP BY semester
       ORDER BY semester ASC`,
      [studentUserId, tenantId],
    );

    const backlogsRes = await this.users.manager.query(
      `SELECT COUNT(*)::int AS count
       FROM student_course_enrollments e
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
         AND (e.grade_points < 4 OR e.status = 'FAILED')`,
      [studentUserId, tenantId],
    );

    const placementRes = await this.users.manager.query(
      `SELECT p.company_name, a.status
       FROM placement_job_applications a
       JOIN placement_job_postings p ON p.job_id = a.job_id
       WHERE a.student_user_id = $1
         AND a.status IN ('OFFERED', 'ACCEPTED')
       LIMIT 1`,
      [studentUserId],
    );

    return {
      student_name: student.name,
      student_email: student.email,
      department: student.department?.dept_name,
      semester_history: historyRows.map((r: Record<string, unknown>) => ({
        semester: Number(r.semester),
        cgpa: r.cgpa ? Number(Number(r.cgpa).toFixed(2)) : 0,
        attendance: r.attendance ? Number(Number(r.attendance).toFixed(2)) : 0,
      })),
      active_backlogs: Number(backlogsRes[0]?.count ?? 0),
      placement: placementRes[0]
        ? {
            status: placementRes[0].status,
            company_name: placementRes[0].company_name,
          }
        : null,
    };
  }

  async listHodLeaveApprovals(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    return this.staffLeaveRequests
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.staff', 'staff')
      .leftJoinAndSelect('staff.department', 'department')
      .where('leave.tenant_id = :tenantId', { tenantId })
      .andWhere('leave.status = :status', { status: 'PENDING' })
      .andWhere('leave.current_approver_user_id = :hodUserId', { hodUserId })
      .andWhere(deptIds.length ? 'staff.dept_id IN (:...deptIds)' : '1=1', {
        deptIds,
      })
      .orderBy('leave.applied_at', 'ASC')
      .getMany();
  }

  async listHodGatePassApprovals(tenantId: string, hodUserId: string) {
    const passes = await this.staffGatePasses.find({
      where: {
        tenant_id: tenantId,
        reporting_officer_id: hodUserId,
        status: 'PENDING',
      },
      relations: ['staff'],
      order: { out_time: 'ASC' },
    });

    return passes.map((pass) => {
      const outDate = new Date(pass.out_time);
      const inDate = new Date(pass.expected_in_time);
      return {
        ...pass,
        date: outDate.toISOString().slice(0, 10),
        out_time_display: outDate.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        }),
        expected_in_display: inDate.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        }),
      };
    });
  }

  private toEnrollmentDto(row: StudentCourseEnrollment) {
    return {
      enrollment_id: row.enrollment_id,
      semester: row.semester,
      status: row.status,
      grade: row.grade,
      grade_points: row.grade_points === null ? null : Number(row.grade_points),
      attendance_percent: Number(row.attendance_percent),
      course: {
        course_id: row.course.course_id,
        course_code: row.course.course_code,
        course_name: row.course.course_name,
        credits: row.course.credits,
        is_elective: row.course.is_elective,
      },
    };
  }

  private getSlotStatus(startTime: string, endTime: string) {
    const now = this.getIstMinutesNow();
    const startMinutes = this.toMinutes(startTime);
    const endMinutes = this.toMinutes(endTime);
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes))
      return 'upcoming';
    if (now < startMinutes) return 'upcoming';
    if (now > endMinutes) return 'done';
    if (now >= startMinutes && now <= endMinutes) return 'ongoing';
    return 'upcoming';
  }

  private toMinutes(time: string) {
    const normalized = this.normalizeTime(time);
    const [hours, minutes = '0'] = normalized.split(':');
    const h = Number(hours);
    const m = Number(minutes);
    if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
    return h * 60 + m;
  }

  private normalizeTime(time: string | Date) {
    if (time instanceof Date) return time.toISOString().slice(11, 16);
    const value = String(time);
    if (value.includes('T')) return value.slice(11, 16);
    return value.slice(0, 5);
  }

  /** One slot per enrolled course; only re-slot courses that share the same day/time. */
  private resolveStudentTimetableSlots(
    rows: AcademicTimetable[],
  ): AcademicTimetable[] {
    const byCourse = new Map<string, AcademicTimetable>();
    for (const row of rows) {
      if (!byCourse.has(row.course_id)) {
        byCourse.set(row.course_id, row);
      }
    }

    const unique = [...byCourse.values()].sort((a, b) =>
      (a.course?.course_code ?? a.course_id).localeCompare(
        b.course?.course_code ?? b.course_id,
      ),
    );
    if (unique.length === 0) return [];

    const slotKey = (row: AcademicTimetable) =>
      `${row.day_of_week}|${this.normalizeTime(row.start_time)}`;

    const buckets = new Map<string, AcademicTimetable[]>();
    for (const row of unique) {
      const key = slotKey(row);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }

    const days = [1, 2, 3, 4, 5, 6];
    const hours = [9, 10, 11, 12, 14, 15, 16];
    const occupied = new Set<string>();
    const result: AcademicTimetable[] = [];

    const placeRow = (row: AcademicTimetable, day: number, hour: number) => {
      const start = `${String(hour).padStart(2, '0')}:00:00`;
      const end = `${String(Math.min(hour + 1, 17)).padStart(2, '0')}:00:00`;
      occupied.add(`${day}|${start.slice(0, 5)}`);
      result.push(
        Object.assign(Object.create(Object.getPrototypeOf(row)), row, {
          day_of_week: day,
          start_time: start,
          end_time: end,
        }),
      );
    };

    const findOpenSlot = (): { day: number; hour: number } | null => {
      for (const day of days) {
        for (const hour of hours) {
          const key = `${day}|${String(hour).padStart(2, '0')}:00`;
          if (!occupied.has(key)) return { day, hour };
        }
      }
      return null;
    };

    for (const group of buckets.values()) {
      const sorted = [...group].sort((a, b) =>
        (a.course?.course_code ?? a.course_id).localeCompare(
          b.course?.course_code ?? b.course_id,
        ),
      );
      const anchor = sorted[0];
      const anchorKey = slotKey(anchor);
      if (!occupied.has(anchorKey)) {
        occupied.add(anchorKey);
        result.push(anchor);
      } else {
        const open = findOpenSlot();
        if (open) placeRow(anchor, open.day, open.hour);
        else result.push(anchor);
      }

      for (const row of sorted.slice(1)) {
        const open = findOpenSlot();
        if (open) placeRow(row, open.day, open.hour);
        else result.push(row);
      }
    }

    return result.sort(
      (a, b) =>
        a.day_of_week - b.day_of_week ||
        this.normalizeTime(a.start_time).localeCompare(
          this.normalizeTime(b.start_time),
        ),
    );
  }

  private resolveWeekStartMonday(input?: string): string {
    if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }
    const istDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
    }).format(new Date());
    const anchor = new Date(`${istDate}T12:00:00+05:30`);
    const day = anchor.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    anchor.setUTCDate(anchor.getUTCDate() + diff);
    return anchor.toISOString().slice(0, 10);
  }

  private buildWeekDateRange(weekStart: string) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const start = new Date(`${weekStart}T12:00:00+05:30`);
    return labels.map((label, index) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + index);
      return {
        day_of_week: index + 1,
        label,
        date: d.toISOString().slice(0, 10),
      };
    });
  }

  private isSessionDone(sessionDate: string, endTime: string): boolean {
    const normalized = this.normalizeTime(endTime);
    const [hours, minutes = '0'] = normalized.split(':');
    const sessionEnd = new Date(
      `${sessionDate}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00+05:30`,
    );
    return Date.now() > sessionEnd.getTime();
  }

  private getIstMinutesNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }

  private getIstDayOfWeek() {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }).format(new Date());
    const map: Record<string, number> = {
      Sun: 7,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekday] ?? 1;
  }

  private isVirtualRoom(room: string | null) {
    if (!room) return false;
    return /zoom|meet|online|virtual|teams|webex|google|hangout|vtop-virtual/i.test(
      room,
    );
  }

  private async fetchActiveLiveClasses(courseIds: string[]) {
    if (courseIds.length === 0) return new Map<string, string>();
    const rows = await this.timetables.manager.query<
      Array<{ course_id: string; meeting_url: string }>
    >(
      `SELECT DISTINCT ON (course_id) course_id, meeting_url
       FROM lms_live_classes
       WHERE course_id = ANY($1::uuid[])
         AND starts_at <= NOW()
         AND ends_at >= NOW()
       ORDER BY course_id, starts_at ASC`,
      [courseIds],
    );
    return new Map(rows.map((row) => [row.course_id, row.meeting_url]));
  }

  private async countPendingAdvisorEvents(tenantId: string): Promise<number> {
    try {
      const rows = await this.users.manager.query(
        `SELECT COUNT(*)::int AS count
         FROM campus_events
         WHERE tenant_id = $1 AND status = 'PENDING_DEAN' AND dean_approval = 'PENDING'`,
        [tenantId],
      );
      return rows[0]?.count ?? 0;
    } catch {
      try {
        const rows = await this.users.manager.query(
          `SELECT COUNT(*)::int AS count
           FROM campus_events
           WHERE tenant_id = $1 AND status = 'PENDING_DEAN'`,
          [tenantId],
        );
        return rows[0]?.count ?? 0;
      } catch {
        return 0;
      }
    }
  }

  private async resolveDeanScope(deanUserId: string) {
    const schoolRows = await this.users.manager.query(
      `SELECT school_id, school_name, school_code
       FROM schools
       WHERE dean_user_id = $1 AND deleted_at IS NULL`,
      [deanUserId],
    );
    const schoolIds = schoolRows.map((row: { school_id: number }) =>
      Number(row.school_id),
    );
    let departmentIds: number[] = [];
    if (schoolIds.length) {
      const deptRows = await this.users.manager.query(
        `SELECT DISTINCT dept_id
         FROM iam_programs
         WHERE school_id = ANY($1::int[]) AND dept_id IS NOT NULL AND deleted_at IS NULL`,
        [schoolIds],
      );
      departmentIds = deptRows.map((row: { dept_id: number }) =>
        Number(row.dept_id),
      );
    }
    const dean = await this.users.findOne({ where: { user_id: deanUserId } });
    if (dean?.dept_id) {
      departmentIds = Array.from(new Set([...departmentIds, dean.dept_id]));
    }
    return {
      schoolIds,
      departmentIds,
      schools: schoolRows.map((row: Record<string, unknown>) => ({
        school_id: Number(row.school_id),
        school_name: String(row.school_name),
        school_code: row.school_code ? String(row.school_code) : null,
      })),
    };
  }

  private async resolveHodDepartmentIds(hodUserId: string) {
    const directDepartments = await this.users.manager.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.users.findOne({ where: { user_id: hodUserId } });
    return Array.from(
      new Set<number>([
        ...directDepartments.map((row: { dept_id: number }) =>
          Number(row.dept_id),
        ),
        ...(hod?.dept_id ? [hod.dept_id] : []),
      ]),
    );
  }

  private listDepartmentFacultyRaw(tenantId: string, deptIds: number[]) {
    return this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.department', 'department')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere("role.role_name IN ('Faculty', 'HOD', 'Dean')")
      .andWhere(deptIds.length ? 'user.dept_id IN (:...deptIds)' : '1=1', {
        deptIds,
      })
      .orderBy('user.name', 'ASC')
      .getMany();
  }

  /**
   * Lists all PENDING helpdesk tickets in the ACADEMICS category,
   * joined with student user info and their student profile.
   */
  async listProfileUpdateRequests() {
    const tickets = await this.helpdeskTickets.find({
      where: { category: 'ACADEMICS', status: 'PENDING' },
      order: { created_at: 'ASC' },
    });

    if (tickets.length === 0) return [];

    const studentIds = [...new Set(tickets.map((t) => t.student_user_id))];
    const students = await this.users.find({
      where: { user_id: In(studentIds) },
      relations: ['department'],
    });
    const profiles = await this.studentProfiles.find({
      where: { user_id: In(studentIds) },
    });

    const studentMap = new Map(students.map((s) => [s.user_id, s]));
    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    return tickets.map((ticket) => {
      const student = studentMap.get(ticket.student_user_id);
      const profile = profileMap.get(ticket.student_user_id);
      return {
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        created_at: ticket.created_at,
        student: {
          user_id: student?.user_id ?? ticket.student_user_id,
          name: student?.name ?? 'Unknown',
          email: student?.email ?? '',
          department: student?.department?.dept_name ?? null,
          enrollment_no: profile?.enrollment_no ?? null,
          mobile:
            (profile?.parent_info as Record<string, unknown>)?.mobile ?? null,
          address:
            (profile?.parent_info as Record<string, unknown>)?.address ?? null,
          parent_details:
            (profile?.parent_info as Record<string, unknown>)?.parent_details ??
            null,
        },
      };
    });
  }

  /**
   * Resolves a pending ACADEMICS ticket by approving (with optional profile
   * updates) or rejecting it. Appends an audit entry to the conversation.
   */
  async resolveProfileUpdateRequest(
    adminUserId: string,
    ticketId: string,
    dto: {
      action: 'APPROVE' | 'REJECT';
      rejection_reason?: string;
      updated_name?: string;
      updated_mobile?: string;
      updated_address?: string;
      updated_parent_details?: Record<string, unknown>;
    },
  ) {
    const ticket = await this.helpdeskTickets.findOne({
      where: { ticket_id: ticketId, category: 'ACADEMICS', status: 'PENDING' },
    });
    if (!ticket)
      throw new NotFoundException('Ticket not found or already resolved');

    const auditEntry = {
      sender_user_id: adminUserId,
      sender_role: 'Admin',
      message:
        dto.action === 'APPROVE'
          ? 'Profile correction request approved and applied.'
          : `Profile correction request rejected. Reason: ${dto.rejection_reason ?? 'No reason provided'}`,
      sent_at: new Date().toISOString(),
    };
    ticket.conversation = [...(ticket.conversation ?? []), auditEntry];
    ticket.status = 'RESOLVED';
    await this.helpdeskTickets.save(ticket);

    if (dto.action === 'APPROVE') {
      // Update user name if provided
      if (dto.updated_name) {
        await this.users.update(
          { user_id: ticket.student_user_id },
          { name: dto.updated_name },
        );
      }

      // Update student profile parent_info fields
      const profile = await this.studentProfiles.findOne({
        where: { user_id: ticket.student_user_id },
      });
      if (profile) {
        const info = profile.parent_info ?? {};
        if (dto.updated_mobile !== undefined) info.mobile = dto.updated_mobile;
        if (dto.updated_address !== undefined)
          info.address = dto.updated_address;
        if (dto.updated_parent_details !== undefined)
          info.parent_details = dto.updated_parent_details;
        profile.parent_info = info;
        await this.studentProfiles.save(profile);
      }
    }

    return { success: true, action: dto.action, ticket_id: ticketId };
  }

  async assignSemesterRollNumbers(
    tenantId: string,
    dto: { semester: number; course_id?: string; sort_by?: 'name' | 'merit' },
  ) {
    const semester = Number(dto.semester);
    if (!Number.isFinite(semester) || semester <= 0) {
      throw new BadRequestException('Valid semester is required');
    }

    const sortBy = dto.sort_by ?? 'name';
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      semester,
      status: 'ENROLLED',
    };
    if (dto.course_id) where.course_id = dto.course_id;

    const enrollments = await this.courseEnrollments.find({
      where,
      relations: ['student'],
    });
    if (!enrollments.length) {
      throw new NotFoundException(
        'No enrollments found for the given semester',
      );
    }

    enrollments.sort((a, b) => {
      if (sortBy === 'merit') {
        const meritA = Number(a.attendance_percent ?? 0);
        const meritB = Number(b.attendance_percent ?? 0);
        if (meritB !== meritA) return meritB - meritA;
      }
      const nameA = a.student?.name ?? '';
      const nameB = b.student?.name ?? '';
      return nameA.localeCompare(nameB);
    });

    for (let i = 0; i < enrollments.length; i++) {
      enrollments[i].roll_number = String(i + 1);
    }
    await this.courseEnrollments.save(enrollments);

    return {
      semester,
      course_id: dto.course_id ?? null,
      assigned: enrollments.length,
      sort_by: sortBy,
    };
  }

  private static readonly NAAC_CRITERIA = [
    {
      id: 1,
      code: 'Criterion I',
      name: 'Curricular Aspects & CBCS Syllabus Alignments',
    },
    {
      id: 2,
      code: 'Criterion II',
      name: 'Teaching-Learning and Evaluation Analytics',
    },
    {
      id: 3,
      code: 'Criterion III',
      name: 'Research Publications, Patents, and Extensions',
    },
    {
      id: 4,
      code: 'Criterion IV',
      name: 'Infrastructure, LMS Resources, and Lab Assets',
    },
    {
      id: 5,
      code: 'Criterion V',
      name: 'Student Support, Mentoring, and Progression Records',
    },
    {
      id: 6,
      code: 'Criterion VI',
      name: 'Governance, Leadership, and Committee Minutes',
    },
    {
      id: 7,
      code: 'Criterion VII',
      name: 'Best Departmental Practices & Academic Audits',
    },
  ];

  private currentAcademicYear() {
    const year = new Date().getFullYear();
    return `${year}-${year + 1}`;
  }

  async getHodDepartmentReports(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const [center, workload, results, weeklyAttendance, deptMeta] =
      await Promise.all([
        this.buildCommandCenterForDepartments(tenantId, hodUserId, deptIds),
        this.listFacultyWorkloadForDepartments(tenantId, deptIds),
        this.listResultAnalyticsForDepartments(tenantId, deptIds),
        this.fetchWeeklyAttendanceSeries(tenantId, deptIds),
        deptIds.length
          ? this.users.manager.query(
              `SELECT dept_name FROM departments WHERE dept_id = ANY($1::int[]) ORDER BY dept_name ASC LIMIT 1`,
              [deptIds],
            )
          : Promise.resolve([]),
      ]);

    const hm = center.health_metrics;
    const syllabus = center.syllabus_coverage ?? [];
    const avgSyllabus =
      syllabus.length > 0
        ? Number(
            (
              syllabus.reduce(
                (sum, row) => sum + Number(row.coverage_percent ?? 0),
                0,
              ) / syllabus.length
            ).toFixed(1),
          )
        : 0;
    const behindSyllabus = syllabus.filter((row) => row.behind_schedule).length;

    const workloadDistribution = {
      balanced: workload.filter((row) => row.workload_status === 'BALANCED')
        .length,
      overloaded: workload.filter((row) => row.workload_status === 'OVERLOADED')
        .length,
      underutilized: workload.filter(
        (row) => row.workload_status === 'UNDERUTILIZED',
      ).length,
    };

    const passRates = results
      .map((row) => Number(row.pass_percent ?? 0))
      .filter((value) => value > 0);
    const avgPassRate =
      passRates.length > 0
        ? Number(
            (
              passRates.reduce((sum, value) => sum + value, 0) /
              passRates.length
            ).toFixed(1),
          )
        : 0;

    return {
      department_name: deptMeta[0]?.dept_name ?? 'Department',
      metrics: {
        total_students: hm.total_students,
        average_attendance: hm.average_attendance,
        attendance_trend_pct: hm.attendance_trend_pct,
        attendance_trend_label: hm.attendance_trend_label,
        lms_completion_pct: avgSyllabus,
        syllabus_behind_count: behindSyllabus,
        target_pass_rate: avgPassRate || 85,
        total_faculty: hm.total_faculty,
      },
      weekly_attendance: weeklyAttendance,
      workload_distribution: workloadDistribution,
      syllabus_coverage: syllabus.map((row) => ({
        course: row.course_code,
        actual: row.coverage_percent,
        planned: Math.min(100, row.coverage_percent + (row.behind_schedule ? 15 : 5)),
      })),
      courses_summary: results.map((row) => {
        const syllabusRow = syllabus.find(
          (item) => item.course_code === row.course_code,
        );
        const passRate = Number(row.pass_percent ?? 0);
        const syllabusStatus =
          syllabusRow?.behind_schedule || passRate < 75
            ? 'Behind'
            : (syllabusRow?.coverage_percent ?? 0) >= 90
              ? 'Ahead'
              : 'On Track';
        return {
          code: row.course_code,
          name: row.course_name,
          enrolled: row.enrolled,
          passRate,
          syllabus: syllabusStatus,
        };
      }),
    };
  }

  private async fetchWeeklyAttendanceSeries(
    tenantId: string,
    deptIds: number[],
  ) {
    if (!deptIds.length) {
      return Array.from({ length: 10 }, (_, index) => ({
        week: `Week ${index + 1}`,
        attendance: 0,
        target: 75,
      }));
    }

    const rows = await this.users.manager.query(
      `SELECT
         ROW_NUMBER() OVER (ORDER BY week_start) AS week_num,
         ROUND(AVG(present_pct)::numeric, 1) AS attendance
       FROM (
         SELECT date_trunc('week', ar.session_date)::date AS week_start,
                CASE WHEN ar.status IN ('PRESENT', 'LATE', 'EXCUSED') THEN 100 ELSE 0 END AS present_pct
         FROM academic_attendance_records ar
         INNER JOIN users u ON u.user_id = ar.student_user_id
         WHERE u.tenant_id = $1
           AND u.dept_id = ANY($2::int[])
           AND ar.session_date >= CURRENT_DATE - 70
       ) weekly
       GROUP BY week_start
       ORDER BY week_start ASC
       LIMIT 10`,
      [tenantId, deptIds],
    );

    if (!rows.length) {
      const center = await this.computeDepartmentAttendanceTrend(
        tenantId,
        deptIds,
      );
      const base = Number(center.current ?? 0);
      return Array.from({ length: 10 }, (_, index) => ({
        week: `Week ${index + 1}`,
        attendance: Math.max(0, Math.min(100, base - (9 - index))),
        target: 75,
      }));
    }

    return rows.map(
      (row: { week_num: number; attendance: number }, index: number) => ({
        week: `Week ${Number(row.week_num ?? index + 1)}`,
        attendance: Number(row.attendance ?? 0),
        target: 75,
      }),
    );
  }

  async getHodIqacCompiler(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const academicYear = this.currentAcademicYear();
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);
    const facultyIds = faculty.map((row) => row.user_id);

    const [submissionRows, vaultRows, latestSubmission] = await Promise.all([
      facultyIds.length
        ? this.users.manager.query(
            `SELECT
               ((tm.task_id - 1) % 7) + 1 AS criterion_id,
               COUNT(DISTINCT s.submission_id)::int AS submission_count,
               COUNT(DISTINCT CASE WHEN s.ai_status = 'VALIDATED' THEN s.submission_id END)::int AS validated_count
             FROM submissions s
             INNER JOIN task_assignments ta ON ta.assignment_id = s.assignment_id
             INNER JOIN task_master tm ON tm.task_id = ta.task_id
             INNER JOIN users u ON u.user_id = ta.assigned_to
             WHERE u.tenant_id = $1
               AND u.dept_id = ANY($2::int[])
             GROUP BY ((tm.task_id - 1) % 7) + 1`,
            [tenantId, deptIds],
          )
        : Promise.resolve([]),
      facultyIds.length
        ? this.users.manager.query(
            `SELECT r.naac_criterion AS criterion_id,
                    COUNT(*)::int AS document_count,
                    MAX(r.title) AS latest_file_name,
                    (
                      SELECT u.name
                      FROM iqac_document_repository r2
                      LEFT JOIN users u ON u.user_id = r2.uploaded_by
                      WHERE r2.tenant_id = $1
                        AND r2.naac_criterion = r.naac_criterion
                        AND (u.dept_id = ANY($2::int[]) OR u.user_id = $3)
                      GROUP BY u.user_id, u.name
                      ORDER BY COUNT(*) DESC
                      LIMIT 1
                    ) AS coordinator_name
             FROM iqac_document_repository r
             LEFT JOIN users u ON u.user_id = r.uploaded_by
             WHERE r.tenant_id = $1
               AND r.academic_year = $4
               AND (u.dept_id = ANY($2::int[]) OR u.user_id = $3)
             GROUP BY r.naac_criterion`,
            [tenantId, deptIds, hodUserId, academicYear],
          ).catch(() => [])
        : Promise.resolve([]),
      deptIds.length
        ? this.users.manager.query(
            `SELECT audit_report_id, status, created_at, findings
             FROM academic_audit_reports
             WHERE tenant_id = $1
               AND department_id = ANY($2::int[])
               AND audit_type = 'DEPARTMENT_SSR'
             ORDER BY created_at DESC
             LIMIT 1`,
            [tenantId, deptIds],
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    type SubmissionCriterionRow = {
      criterion_id: number;
      submission_count: number;
      validated_count: number;
    };
    type VaultCriterionRow = {
      criterion_id: number;
      document_count: number;
      latest_file_name: string | null;
      coordinator_name: string | null;
    };

    const submissionByCriterion = new Map<number, SubmissionCriterionRow>(
      submissionRows.map((row: SubmissionCriterionRow) => [
        Number(row.criterion_id),
        row,
      ]),
    );
    const vaultByCriterion = new Map<number, VaultCriterionRow>(
      vaultRows.map((row: VaultCriterionRow) => [Number(row.criterion_id), row]),
    );

    const facultyCount = Math.max(faculty.length, 1);
    const criteria = AcademicsService.NAAC_CRITERIA.map((item) => {
      const submissions = submissionByCriterion.get(item.id);
      const vault = vaultByCriterion.get(item.id);
      const docCount = Number(vault?.document_count ?? 0);
      const validated = Number(submissions?.validated_count ?? 0);
      const pendingFaculty = Math.max(
        0,
        faculty.length - Math.min(faculty.length, validated + docCount),
      );
      const completion = Math.min(
        100,
        Math.round(
          ((docCount * 25 + validated * 15) / facultyCount) * 10 +
            (docCount > 0 ? 20 : 0),
        ),
      );
      const status =
        latestSubmission[0]?.status === 'SUBMITTED'
          ? 'SUBMITTED'
          : completion >= 75 || docCount > 0
            ? 'READY'
            : 'PENDING';
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        completion,
        status,
        owner:
          vault?.coordinator_name ??
          faculty.find((member) => member.role?.role_name === 'Faculty')?.name ??
          faculty[0]?.name ??
          'HOD Office',
        evidence_file: vault?.latest_file_name ?? null,
        pending_faculty: pendingFaculty,
      };
    });

    const overallProgress = Math.round(
      criteria.reduce((sum, row) => sum + row.completion, 0) / criteria.length,
    );

    return {
      academic_year: academicYear,
      department_name: faculty[0]?.department?.dept_name ?? 'Department',
      submitted: latestSubmission[0]?.status === 'SUBMITTED',
      submitted_at: latestSubmission[0]?.created_at ?? null,
      submission_comments:
        latestSubmission[0]?.findings?.comments ??
        latestSubmission[0]?.findings?.hod_comments ??
        null,
      master_file:
        latestSubmission[0]?.findings?.master_file_name ?? null,
      overall_progress: overallProgress,
      criteria,
    };
  }

  async uploadHodIqacEvidence(
    tenantId: string,
    hodUserId: string,
    dto: {
      criterion_id: number;
      file_path: string;
      file_name: string;
      title?: string;
    },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) {
      throw new ForbiddenException('No department scope for this HOD');
    }
    if (dto.criterion_id < 1 || dto.criterion_id > 7) {
      throw new BadRequestException('criterion_id must be between 1 and 7');
    }
    if (!dto.file_path?.trim() || !dto.file_name?.trim()) {
      throw new BadRequestException('file_path and file_name are required');
    }

    const criterion = AcademicsService.NAAC_CRITERIA.find(
      (row) => row.id === dto.criterion_id,
    );
    const academicYear = this.currentAcademicYear();
    const title =
      dto.title?.trim() ||
      `${criterion?.code ?? 'Criterion'} — ${dto.file_name}`;

    await this.users.manager.query(
      `INSERT INTO iqac_document_repository (
         tenant_id, naac_criterion, metric_number, title, file_path, uploaded_by, academic_year
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        dto.criterion_id,
        `${dto.criterion_id}.1`,
        title,
        dto.file_path.trim(),
        hodUserId,
        academicYear,
      ],
    );

    return this.getHodIqacCompiler(tenantId, hodUserId);
  }

  async submitHodIqacDepartment(
    tenantId: string,
    hodUserId: string,
    dto: {
      comments?: string;
      master_file_path?: string;
      master_file_name?: string;
    },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) {
      throw new ForbiddenException('No department scope for this HOD');
    }

    const compiler = await this.getHodIqacCompiler(tenantId, hodUserId);
    const pending = compiler.criteria.filter((row) => row.status === 'PENDING');
    if (pending.length > 0) {
      throw new BadRequestException(
        `Cannot submit until all criteria are ready. Pending: ${pending.map((row) => row.code).join(', ')}`,
      );
    }

    const academicYear = this.currentAcademicYear();
    const departmentId = deptIds[0];

    await this.users.manager.query(
      `INSERT INTO academic_audit_reports (
         tenant_id, department_id, academic_year, audit_type, findings, status, prepared_by_user_id
       ) VALUES ($1, $2, $3, 'DEPARTMENT_SSR', $4::jsonb, 'SUBMITTED', $5)`,
      [
        tenantId,
        departmentId,
        academicYear,
        JSON.stringify({
          comments: dto.comments ?? '',
          hod_comments: dto.comments ?? '',
          master_file_path: dto.master_file_path ?? null,
          master_file_name: dto.master_file_name ?? null,
          criteria_snapshot: compiler.criteria,
          submitted_from: 'hod_iqac_portal',
        }),
        hodUserId,
      ],
    );

    await this.users.manager.query(
      `INSERT INTO iqac_document_repository (
         tenant_id, naac_criterion, metric_number, title, file_path, uploaded_by, academic_year
       )
       SELECT $1,
              ((tm.task_id - 1) % 7) + 1,
              ((tm.task_id - 1) % 7) + 1 || '.1',
              COALESCE(s.file_name, tm.task_name),
              s.file_path,
              ta.assigned_to,
              $4
       FROM submissions s
       INNER JOIN task_assignments ta ON ta.assignment_id = s.assignment_id
       INNER JOIN task_master tm ON tm.task_id = ta.task_id
       INNER JOIN users u ON u.user_id = ta.assigned_to
       WHERE u.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND s.file_path IS NOT NULL
         AND s.ai_status IN ('VALIDATED', 'PENDING')
         AND NOT EXISTS (
           SELECT 1 FROM iqac_document_repository r
           WHERE r.tenant_id = $1
             AND r.file_path = s.file_path
             AND r.naac_criterion = ((tm.task_id - 1) % 7) + 1
         )`,
      [tenantId, deptIds, hodUserId, academicYear],
    ).catch(() => undefined);

    if (dto.master_file_path?.trim()) {
      await this.users.manager.query(
        `INSERT INTO iqac_document_repository (
           tenant_id, naac_criterion, metric_number, title, file_path, uploaded_by, academic_year
         ) VALUES ($1, 1, 'SSR', $2, $3, $4, $5)`,
        [
          tenantId,
          dto.master_file_name?.trim() || 'Department SSR Package',
          dto.master_file_path.trim(),
          hodUserId,
          academicYear,
        ],
      ).catch(() => undefined);
    }

    return this.getHodIqacCompiler(tenantId, hodUserId);
  }
}

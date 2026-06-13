import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    @InjectRepository(AttendanceRecord) private attendance: Repository<AttendanceRecord>,
    @InjectRepository(ExamResult) private results: Repository<ExamResult>,
    @InjectRepository(GradingPolicy) private gradingPolicies: Repository<GradingPolicy>,
    @InjectRepository(AcademicCourse) private courses: Repository<AcademicCourse>,
    @InjectRepository(StudentCourseEnrollment)
    private courseEnrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(AcademicTimetable) private timetables: Repository<AcademicTimetable>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(StaffAttendance) private staffAttendance: Repository<StaffAttendance>,
    @InjectRepository(StaffLeaveRequest)
    private staffLeaveRequests: Repository<StaffLeaveRequest>,
    @InjectRepository(StaffGatePass) private staffGatePasses: Repository<StaffGatePass>,
    private readonly notify: NotificationEmitterService,
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
    const creditsCompleted = completed.reduce((sum, row) => sum + row.course.credits, 0);
    const cgpa =
      creditsCompleted > 0
        ? Number((weightedGradePoints / creditsCompleted).toFixed(2))
        : 0;

    const attendanceRows = enrollments.filter((row) => row.attendance_percent !== null);
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

  async listMyCourseEnrollments(studentUserId: string) {
    const rows = await this.courseEnrollments.find({
      where: { student_user_id: studentUserId },
      relations: ['course'],
      order: { semester: 'ASC' },
    });
    return rows.map((row) => this.toEnrollmentDto(row));
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
    return electives.filter((course) => !existingCourseIds.has(course.course_id));
  }

  async registerCourses(studentUserId: string, tenantId: string, courseIds: string[]) {
    const uniqueCourseIds = [...new Set(courseIds)].filter(Boolean);
    if (uniqueCourseIds.length === 0) return [];

    const courses = await this.courses.find({
      where: {
        tenant_id: tenantId,
        course_id: In(uniqueCourseIds),
        is_elective: true,
      },
    });

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
          semester: 5,
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
      pending_gate_pass_approvals: center.health_metrics.pending_gate_pass_count,
      pending_profile_corrections: center.health_metrics.pending_profile_corrections,
    };
  }

  async getHodCommandCenter(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
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
      this.buildHodPendingInbox(tenantId, hodUserId, deptIds),
      this.listHodStudents(tenantId, hodUserId, true).then((rows) => rows.slice(0, 5)),
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

    const pendingLeaveCount = pendingInbox.filter((row) => row.type === 'LEAVE').length;
    const pendingGatePassCount = pendingInbox.filter((row) => row.type === 'GATE_PASS').length;

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
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT u.user_id, u.name, u.official_email AS email,
              COALESCE(SUM(
                EXTRACT(EPOCH FROM (t.end_time::time - t.start_time::time)) / 3600
              ), 0)::numeric(6,1) AS hours_per_week,
              COUNT(DISTINCT t.course_id)::int AS course_count
       FROM users u
       LEFT JOIN academic_timetables t
         ON t.faculty_user_id = u.user_id AND t.tenant_id = u.tenant_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
       GROUP BY u.user_id, u.name, u.official_email
       ORDER BY hours_per_week DESC, u.name ASC`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
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
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time, t.room,
              c.course_code, c.course_name,
              u.user_id AS faculty_user_id, u.name AS faculty_name
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       INNER JOIN users u ON u.user_id = t.faculty_user_id
       WHERE t.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       ORDER BY t.day_of_week ASC, t.start_time ASC, c.course_code ASC`,
      [tenantId, deptIds],
    );
  }

  async listHodCourseAllocationSlots(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const [slots, faculty] = await Promise.all([
      this.listHodDepartmentTimetable(tenantId, hodUserId),
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

  async listHodResultAnalytics(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return [];

    const rows = await this.users.manager.query(
      `SELECT c.course_code, c.course_name,
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
        course_code: row.course_code,
        course_name: row.course_name,
        enrolled,
        passed,
        failed,
        pass_percent: graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0,
      };
    });
  }

  async listHodGrievances(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT t.ticket_id, t.subject AS title, t.category, t.status, t.created_at,
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
      average_grade_points: row.average_grade_points === null ? null : Number(row.average_grade_points),
      course_count: Number(row.course_count ?? 0),
      low_attendance_courses: Number(row.low_attendance_courses ?? 0),
      failing_courses: Number(row.failing_courses ?? 0),
    }));
  }

  async listHodAppraisals(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
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
      throw new NotFoundException('Appraisal not found in your department scope');
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
    return { appraisal_record_id: appraisalId, hod_rating: hodRating, hr_final_status: 'HR_APPROVED' };
  }

  private async countFacultyOnLeaveToday(tenantId: string, facultyIds: string[], today: string) {
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

  private async countClassesScheduledToday(tenantId: string, facultyIds: string[], dayOfWeek: number) {
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

  private async computeDepartmentAttendanceTrend(tenantId: string, deptIds: number[]) {
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
              enrollments.reduce((sum, row) => sum + Number(row.attendance_percent ?? 0), 0) /
              enrollments.length
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
      `SELECT c.course_code, c.course_name, u.name AS faculty_name,
              COUNT(*)::int AS total_modules,
              COUNT(*) FILTER (WHERE m.status = 'COMPLETED')::int AS completed_modules
       FROM course_modules m
       INNER JOIN academic_courses c ON c.course_id = m.course_id
       INNER JOIN users u ON u.user_id = m.faculty_user_id
       WHERE m.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       GROUP BY c.course_id, c.course_code, c.course_name, u.user_id, u.name
       ORDER BY
         (COUNT(*) FILTER (WHERE m.status = 'COMPLETED')::float / NULLIF(COUNT(*), 0)) ASC NULLS FIRST,
         c.course_code ASC
       LIMIT 12`,
      [tenantId, deptIds],
    );

    return rows.map((row: Record<string, unknown>) => {
      const total = Number(row.total_modules ?? 0);
      const completed = Number(row.completed_modules ?? 0);
      const percent = total > 0 ? Number(((completed / total) * 100).toFixed(0)) : 0;
      return {
        course_code: row.course_code,
        course_name: row.course_name,
        faculty_name: row.faculty_name,
        completed_modules: completed,
        total_modules: total,
        coverage_percent: percent,
        behind_schedule: percent < 60,
      };
    });
  }

  private async buildHodPendingInbox(tenantId: string, hodUserId: string, deptIds: number[]) {
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
        created_at: leave.applied_at?.toISOString?.() ?? new Date().toISOString(),
      });
    }

    for (const pass of gatePasses) {
      inbox.push({
        id: pass.pass_id,
        type: 'GATE_PASS',
        title: 'Gate Pass',
        employee_name: pass.staff?.name ?? 'Faculty',
        date_label: pass.out_time ? new Date(pass.out_time).toLocaleString('en-IN') : '—',
        detail: pass.reason ?? '—',
        created_at: pass.out_time?.toISOString?.() ?? new Date().toISOString(),
      });
    }

    for (const adj of adjustments as Array<Record<string, unknown>>) {
      const adjType = String(adj.adjustment_type ?? 'EXTRA_CLASS');
      inbox.push({
        id: String(adj.adjustment_id),
        type: adjType === 'CANCEL' ? 'CANCEL' : 'EXTRA_CLASS',
        title: adjType === 'CANCEL' ? 'Class Cancellation' : 'Extra / Substitute Class',
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
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  async listHodFacultyRoster(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);
    const facultyIds = faculty.map((row) => row.user_id);
    const allocations =
      facultyIds.length === 0
        ? []
        : await this.timetables.find({
            where: { tenant_id: tenantId, faculty_user_id: In(facultyIds) },
            relations: ['course'],
            order: { day_of_week: 'ASC', start_time: 'ASC' },
          });

    return faculty.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      department: row.department?.dept_name ?? null,
      role: row.role?.role_name ?? null,
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
    }));
  }

  async allocateHodCourse(
    tenantId: string,
    hodUserId: string,
    dto: { timetable_id: string; faculty_user_id: string },
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const faculty = await this.users.findOne({
      where: { user_id: dto.faculty_user_id, tenant_id: tenantId },
      relations: ['role'],
    });
    if (!faculty || !deptIds.includes(faculty.dept_id)) {
      throw new Error('Faculty member is outside this HOD department scope');
    }

    await this.timetables.update(
      { timetable_id: dto.timetable_id, tenant_id: tenantId },
      { faculty_user_id: dto.faculty_user_id },
    );
    const slot = await this.timetables.findOne({
      where: { timetable_id: dto.timetable_id, tenant_id: tenantId },
      relations: ['course', 'faculty'],
    });
    if (slot?.course_id) {
      await this.notifyCourseStudents(
        tenantId,
        slot.course_id,
        slot.course?.course_name ?? 'Course',
        `Faculty assignment updated for this slot.`,
      );
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
    return saved;
  }

  async listHodStudents(tenantId: string, hodUserId: string, lowAttendance = false) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const students = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere("role.role_name = 'Student'")
      .andWhere(deptIds.length ? 'user.dept_id IN (:...deptIds)' : '1=1', { deptIds })
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
        const rows = enrollments.filter((row) => row.student_user_id === student.user_id);
        const attendance =
          rows.length > 0
            ? Number((rows.reduce((sum, row) => sum + Number(row.attendance_percent), 0) / rows.length).toFixed(2))
            : 0;
        const completed = rows.filter((row) => row.status === 'COMPLETED' && row.grade_points !== null);
        const weightedGradePoints = completed.reduce((sum, row) => sum + Number(row.grade_points) * row.course.credits, 0);
        const creditsCompleted = completed.reduce((sum, row) => sum + row.course.credits, 0);
        const cgpa = creditsCompleted > 0 ? Number((weightedGradePoints / creditsCompleted).toFixed(2)) : 0;

        return {
          user_id: student.user_id,
          name: student.name,
          email: student.email,
          department: student.department?.dept_name ?? null,
          average_attendance: attendance,
          course_count: rows.length,
          low_attendance: attendance < 75,
          cgpa,
          enrollment_year: student.created_at ? new Date(student.created_at).getFullYear() : new Date().getFullYear(),
        };
      })
      .filter((student) => !lowAttendance || student.low_attendance);
  }

  async getHodStudentDetail(tenantId: string, hodUserId: string, studentUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
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
      placement: placementRes[0] ? { status: placementRes[0].status, company_name: placementRes[0].company_name } : null,
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
      .andWhere(deptIds.length ? 'staff.dept_id IN (:...deptIds)' : '1=1', { deptIds })
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
        out_time_display: outDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
        expected_in_display: inDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
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
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return 'upcoming';
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
    return /zoom|meet|online|virtual|teams|webex|google|hangout|vtop-virtual/i.test(room);
  }

  private async fetchActiveLiveClasses(courseIds: string[]) {
    if (courseIds.length === 0) return new Map<string, string>();
    const rows = await this.timetables.manager.query<Array<{ course_id: string; meeting_url: string }>>(
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

  private async resolveHodDepartmentIds(hodUserId: string) {
    const directDepartments = await this.users.manager.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.users.findOne({ where: { user_id: hodUserId } });
    return Array.from(
      new Set<number>([
        ...directDepartments.map((row: { dept_id: number }) => Number(row.dept_id)),
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
      .andWhere(deptIds.length ? 'user.dept_id IN (:...deptIds)' : '1=1', { deptIds })
      .orderBy('user.name', 'ASC')
      .getMany();
  }
}

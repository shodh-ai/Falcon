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
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const today = new Date().toISOString().slice(0, 10);
    const faculty = await this.listDepartmentFacultyRaw(tenantId, deptIds);
    const facultyIds = faculty.map((row) => row.user_id);

    const [facultyPresentToday, totalStudents, enrollments, pendingLeaves, pendingGatePasses] = await Promise.all([
      facultyIds.length
        ? this.staffAttendance
            .createQueryBuilder('attendance')
            .where('attendance.user_id IN (:...facultyIds)', { facultyIds })
            .andWhere('attendance.work_date = :today', { today })
            .andWhere('attendance.check_in_at IS NOT NULL')
            .getCount()
        : Promise.resolve(0),
      this.users
        .createQueryBuilder('user')
        .leftJoin('user.role', 'role')
        .where('user.tenant_id = :tenantId', { tenantId })
        .andWhere("role.role_name = 'Student'")
        .andWhere(deptIds.length ? 'user.dept_id IN (:...deptIds)' : '1=1', { deptIds })
        .getCount(),
      this.courseEnrollments
        .createQueryBuilder('enrollment')
        .leftJoin('enrollment.student', 'student')
        .where('enrollment.tenant_id = :tenantId', { tenantId })
        .andWhere(deptIds.length ? 'student.dept_id IN (:...deptIds)' : '1=1', { deptIds })
        .getMany(),
      this.listHodLeaveApprovals(tenantId, hodUserId),
      this.listHodGatePassApprovals(tenantId, hodUserId),
    ]);

    const averageAttendance =
      enrollments.length > 0
        ? Number(
            (
              enrollments.reduce((sum, row) => sum + Number(row.attendance_percent ?? 0), 0) /
              enrollments.length
            ).toFixed(2),
          )
        : 0;

    return {
      faculty_present_today: facultyPresentToday,
      total_faculty: faculty.length,
      total_students: totalStudents,
      average_department_attendance: averageAttendance,
      pending_leave_approvals: pendingLeaves.length,
      pending_gate_pass_approvals: pendingGatePasses.length,
    };
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
        return {
          user_id: student.user_id,
          name: student.name,
          email: student.email,
          department: student.department?.dept_name ?? null,
          average_attendance: attendance,
          course_count: rows.length,
          low_attendance: attendance < 75,
        };
      })
      .filter((student) => !lowAttendance || student.low_attendance);
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
    return this.staffGatePasses.find({
      where: {
        tenant_id: tenantId,
        reporting_officer_id: hodUserId,
        status: 'PENDING',
      },
      relations: ['staff'],
      order: { out_time: 'ASC' },
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

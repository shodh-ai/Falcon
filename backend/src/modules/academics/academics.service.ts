import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
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
  ) {}

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

    const day = new Date().getDay();
    const isoDay = day === 0 ? 7 : day;
    const rows = await this.timetables.find({
      where: {
        course_id: In(courseIds),
        day_of_week: isoDay,
      },
      relations: ['course', 'faculty'],
      order: { start_time: 'ASC' },
    });

    return rows.map((row) => ({
      timetable_id: row.timetable_id,
      course_id: row.course_id,
      course_code: row.course.course_code,
      course_name: row.course.course_name,
      credits: row.course.credits,
      room: row.room,
      faculty_name: row.faculty?.name ?? null,
      start_time: row.start_time,
      end_time: row.end_time,
      status: this.getSlotStatus(row.start_time, row.end_time),
    }));
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
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = this.toMinutes(startTime);
    const endMinutes = this.toMinutes(endTime);
    if (currentMinutes < startMinutes) return 'upcoming';
    if (currentMinutes > endMinutes) return 'done';
    return 'ongoing';
  }

  private toMinutes(time: string) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

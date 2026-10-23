import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MentorshipMeeting } from '../../entities/mentorship-meeting.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { facultyAttendanceStatsCte } from './faculty-attendance-sql';
export type AuthCtx = { userId: string; tenantId: string; roles: string[] };

@Injectable()
export class EarlyWarningService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(MentorshipMeeting)
    private readonly meetings: Repository<MentorshipMeeting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notify: NotificationEmitterService,
  ) {}
  async getFacultyAtRiskStudents(ctx: AuthCtx) {
    const rows = await this.db.query(
      `WITH faculty_courses AS (
         SELECT DISTINCT a.course_id
         FROM academic_course_allocations a
         WHERE a.faculty_user_id = $1
           AND a.tenant_id = $2
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
         UNION
         SELECT DISTINCT tt.course_id
         FROM academic_timetables tt
         WHERE tt.faculty_user_id = $1
           AND tt.tenant_id = $2
           AND tt.deleted_at IS NULL
       ),
       ${facultyAttendanceStatsCte('$2')},
       faculty_enrollments AS (
         SELECT DISTINCT sce.tenant_id, sce.student_user_id, sce.course_id
         FROM student_course_enrollments sce
         JOIN faculty_courses fc ON fc.course_id = sce.course_id
         WHERE sce.tenant_id = $2 AND sce.status = 'ENROLLED'
           AND (to_jsonb(sce)->>'deleted_at') IS NULL
       ),
       faculty_students AS (
         SELECT DISTINCT student_user_id FROM faculty_enrollments
       ),
       att_stats AS (
         SELECT sce.student_user_id,
                COALESCE(SUM(a.attendance_record_count), 0)::int AS attendance_record_count,
                ROUND(
                  100.0 * SUM(a.attendance_present_count) / NULLIF(SUM(a.attendance_record_count), 0),
                  2
                ) AS attendance_percent
         FROM faculty_enrollments sce
         LEFT JOIN attendance_stats a
           ON a.tenant_id = sce.tenant_id
          AND a.course_id = sce.course_id
          AND a.student_user_id = sce.student_user_id::text
         GROUP BY sce.student_user_id
       ),
       exam_stats AS (
         SELECT m.student_user_id,
                SUM(m.marks_obtained) AS total_obtained,
                SUM(m.max_marks) AS total_max,
                COUNT(*)::int AS published_assessment_count
         FROM academic_marks m
         JOIN faculty_courses fc ON fc.course_id = m.course_id
         WHERE m.tenant_id = $2 AND m.status = 'PUBLISHED'
           AND (to_jsonb(m)->>'deleted_at') IS NULL
           AND m.max_marks > 0
           AND m.marks_obtained IS NOT NULL
           AND m.marks_obtained BETWEEN 0 AND m.max_marks
           AND EXISTS (
             SELECT 1 FROM faculty_enrollments fe
             WHERE fe.tenant_id = m.tenant_id
               AND fe.course_id = m.course_id
               AND fe.student_user_id = m.student_user_id
           )
         GROUP BY m.student_user_id
       )
       SELECT u.user_id,
              u.name,
              u.official_email,
              sp.enrollment_no,
              d.dept_name,
              sp.batch,
              a.attendance_percent,
              COALESCE(a.attendance_record_count, 0)::int AS attendance_record_count,
              e.total_max,
              e.total_obtained,
              COALESCE(e.published_assessment_count, 0)::int AS published_assessment_count
       FROM faculty_students fs
       JOIN users u ON u.user_id = fs.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN att_stats a ON a.student_user_id = u.user_id
       LEFT JOIN exam_stats e ON e.student_user_id = u.user_id
       WHERE u.tenant_id = $2`,
      [ctx.userId, ctx.tenantId],
    );

    const atRiskStudents = rows
      .map((r: any) => {
        let riskScore = 0;
        const riskFactors: string[] = [];

        const attendanceCount = Number(r.attendance_record_count ?? 0);
        const rawAttendance = r.attendance_percent == null ? null : Number(r.attendance_percent);
        const attendancePct = attendanceCount > 0 && rawAttendance !== null && Number.isFinite(rawAttendance)
          ? rawAttendance
          : null;

        if (attendancePct !== null) {
          if (attendancePct !== null && attendancePct < 75) {
            riskScore += 50;
            riskFactors.push(
              `Critical Attendance (${Math.round(attendancePct)}%)`,
            );
          } else if (attendancePct !== null && attendancePct < 85) {
            riskScore += 20;
            riskFactors.push(`Low Attendance (${Math.round(attendancePct)}%)`);
          }
        }

        const assessmentCount = Number(r.published_assessment_count ?? 0);
        const totalMax = Number(r.total_max ?? 0);
        const totalObtained = r.total_obtained == null ? null : Number(r.total_obtained);
        let marksPct: number | null = null;

        if (assessmentCount > 0 && totalMax > 0 && totalObtained !== null && Number.isFinite(totalMax) && Number.isFinite(totalObtained)) {
          marksPct = (totalObtained / totalMax) * 100;
          if (marksPct !== null && marksPct < 40) {
            riskScore += 50;
            riskFactors.push(`Failing Grades (${Math.round(marksPct)}%)`);
          } else if (marksPct !== null && marksPct < 60) {
            riskScore += 25;
            riskFactors.push(`Poor Grades (${Math.round(marksPct)}%)`);
          }
        }

        return {
          user_id: r.user_id,
          name: r.name,
          email: r.official_email,
          enrollment_no: r.enrollment_no,
          department: r.dept_name,
          batch: r.batch,
          risk_score: riskScore,
          risk_level:
            riskScore >= 75 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
          risk_factors: riskFactors,
          metrics: {
            attendance_percent: attendancePct,
            grades_percent: marksPct,
            attendance_record_count: attendanceCount,
            published_assessment_count: assessmentCount,
          },
        };
      })
      .filter((s: any) => s.risk_score >= 40)
      .sort((a: any, b: any) => b.risk_score - a.risk_score);

    return atRiskStudents;
  }

  async scheduleIntervention(facultyUserId: string, studentUserId: string) {
    const student = await this.users.findOne({
      where: { user_id: studentUserId },
    });
    if (!student) {
      throw new Error('Student not found');
    }

    const meeting = await this.meetings.save(
      this.meetings.create({
        student_user_id: studentUserId,
        proctor_user_id: facultyUserId,
        requested_time: new Date(Date.now() + 24 * 60 * 60 * 1000), // Request meeting for tomorrow
        topic: 'Early Warning Intervention - Low Attendance/Grades',
        status: 'PENDING',
      }),
    );

    if (student.tenant_id) {
      this.notify.meetingRequested({
        tenantId: student.tenant_id,
        userId: studentUserId,
        studentName: student.name,
        meetingAt: meeting.requested_time.toLocaleString(),
        title: 'Meeting Requested by Faculty',
        message:
          'A faculty member has scheduled an intervention meeting regarding your academic performance.',
        actionLink: '/student/mentorship',
      });
    }

    return {
      meeting_id: meeting.meeting_id,
      status: meeting.status,
    };
  }
}

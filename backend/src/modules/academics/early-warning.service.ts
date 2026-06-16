import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MentorshipMeeting } from '../../entities/mentorship-meeting.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
export type AuthCtx = { userId: string; tenantId: string; roles: string[] };

@Injectable()
export class EarlyWarningService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(MentorshipMeeting) private readonly meetings: Repository<MentorshipMeeting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notify: NotificationEmitterService,
  ) {}
  async getFacultyAtRiskStudents(ctx: AuthCtx) {
    const rows = await this.db.query(
      `WITH faculty_students AS (
         SELECT DISTINCT sce.student_user_id
         FROM student_course_enrollments sce
         JOIN academic_timetables tt ON tt.course_id = sce.course_id
         WHERE tt.faculty_user_id = $1 AND tt.tenant_id = $2
       ),
       att_stats AS (
         SELECT att.student_user_id,
                COUNT(*) as total_sessions,
                COUNT(*) FILTER (WHERE att.status = 'PRESENT') as present_sessions
         FROM academic_attendance_records att
         WHERE att.student_user_id IN (SELECT student_user_id FROM faculty_students)
         GROUP BY att.student_user_id
       ),
       exam_stats AS (
         SELECT ex.student_user_id,
                SUM(ex.marks_obtained) as total_obtained,
                SUM(ex.max_marks) as total_max
         FROM academic_exam_results ex
         WHERE ex.student_user_id IN (SELECT student_user_id FROM faculty_students)
         GROUP BY ex.student_user_id
       )
       SELECT u.user_id,
              u.name,
              u.official_email,
              sp.enrollment_no,
              d.dept_name,
              sp.batch,
              a.total_sessions,
              a.present_sessions,
              e.total_max,
              e.total_obtained
       FROM faculty_students fs
       JOIN users u ON u.user_id = fs.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN att_stats a ON a.student_user_id = u.user_id
       LEFT JOIN exam_stats e ON e.student_user_id = u.user_id
       WHERE u.tenant_id = $2`,
      [ctx.userId, ctx.tenantId]
    );

    const atRiskStudents = rows
      .map((r: any) => {
        let riskScore = 0;
        const riskFactors: string[] = [];

        const totalSessions = Number(r.total_sessions || 0);
        const presentSessions = Number(r.present_sessions || 0);
        let attendancePct: number | null = null;

        if (totalSessions > 0) {
          attendancePct = (presentSessions / totalSessions) * 100;
          if (attendancePct !== null && attendancePct < 75) {
            riskScore += 50;
            riskFactors.push(`Critical Attendance (${Math.round(attendancePct)}%)`);
          } else if (attendancePct !== null && attendancePct < 85) {
            riskScore += 20;
            riskFactors.push(`Low Attendance (${Math.round(attendancePct)}%)`);
          }
        }

        const totalMax = Number(r.total_max || 0);
        const totalObtained = Number(r.total_obtained || 0);
        let marksPct: number | null = null;

        if (totalMax > 0) {
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
          risk_level: riskScore >= 75 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
          risk_factors: riskFactors,
          metrics: {
            attendance_percent: attendancePct,
            grades_percent: marksPct,
          },
        };
      })
      .filter((s: any) => s.risk_score >= 40)
      .sort((a: any, b: any) => b.risk_score - a.risk_score);

    return atRiskStudents;
  }

  async scheduleIntervention(facultyUserId: string, studentUserId: string) {
    const student = await this.users.findOne({ where: { user_id: studentUserId } });
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
      })
    );

    if (student.tenant_id) {
      this.notify.meetingRequested({
        tenantId: student.tenant_id,
        userId: studentUserId,
        studentName: student.name,
        meetingAt: meeting.requested_time.toLocaleString(),
        title: 'Meeting Requested by Faculty',
        message: 'A faculty member has scheduled an intervention meeting regarding your academic performance.',
        actionLink: '/student/mentorship',
      });
    }

    return {
      meeting_id: meeting.meeting_id,
      status: meeting.status,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type ReminderCandidate = {
  tenant_id: string;
  faculty_user_id: string;
  log_faculty_id: string;
  course_id: string;
  course_code: string;
  timetable_id: string | null;
  class_adjustment_id: string | null;
  class_date: string;
  section: string | null;
  deadline_at: Date | string;
};

@Injectable()
export class AttendanceDeadlineReminderService {
  private readonly logger = new Logger(AttendanceDeadlineReminderService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private lockDays() {
    const configured = Number(process.env.ATTENDANCE_LOCK_AFTER_DAYS ?? 3);
    return Number.isFinite(configured) && configured >= 0 && configured <= 30
      ? Math.floor(configured)
      : 3;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanAttendanceDeadlines(now = new Date()) {
    const rows = await this.dataSource.query<ReminderCandidate[]>(
      `WITH campus AS (
         SELECT (NOW() AT TIME ZONE 'Asia/Kolkata') AS local_now,
                (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today
       ), class_day AS (
         SELECT (campus.today-offsets.days_ago)::date AS date,campus.local_now
         FROM campus
         CROSS JOIN generate_series($1::int,$1::int+1) AS offsets(days_ago)
       ), regular AS (
         SELECT t.tenant_id,COALESCE(p.proxy_faculty_id,t.faculty_user_id) AS faculty_user_id,
                t.faculty_user_id AS log_faculty_id,t.course_id,c.course_code,
                t.timetable_id,NULL::uuid AS class_adjustment_id,d.date AS class_date,
                t.section,((d.date+($1::int+1))::timestamp AT TIME ZONE 'Asia/Kolkata') AS deadline_at
         FROM class_day d
         JOIN academic_timetables t ON t.day_of_week=EXTRACT(ISODOW FROM d.date)::int
           AND t.deleted_at IS NULL
           AND (t.valid_from IS NULL OR t.valid_from<=d.date)
           AND (t.valid_to IS NULL OR t.valid_to>=d.date)
         JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
         LEFT JOIN academic_proxy_requests p ON p.tenant_id=t.tenant_id
           AND p.timetable_id=t.timetable_id AND p.date_of_proxy=d.date AND p.status='APPROVED'
         WHERE NOT EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=d.date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=t.start_time)
           AND NOT EXISTS (SELECT 1 FROM academic_class_moves m
             WHERE m.tenant_id=t.tenant_id AND m.source_timetable_id=t.timetable_id
               AND m.source_date=d.date AND m.status='APPROVED')
       ), moved AS (
         SELECT t.tenant_id,COALESCE(p.proxy_faculty_id,t.faculty_user_id) AS faculty_user_id,
                t.faculty_user_id AS log_faculty_id,t.course_id,c.course_code,
                t.timetable_id,NULL::uuid AS class_adjustment_id,d.date AS class_date,
                t.section,((d.date+($1::int+1))::timestamp AT TIME ZONE 'Asia/Kolkata') AS deadline_at
         FROM class_day d
         JOIN academic_class_moves m ON m.target_date=d.date AND m.status='APPROVED'
         JOIN academic_timetables t ON t.tenant_id=m.tenant_id
           AND t.timetable_id=m.source_timetable_id AND t.deleted_at IS NULL
         JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
         LEFT JOIN academic_proxy_requests p ON p.tenant_id=t.tenant_id
           AND p.timetable_id=t.timetable_id AND p.date_of_proxy=d.date AND p.status='APPROVED'
         WHERE NOT EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=d.date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=m.target_start_time)
       ), extras AS (
         SELECT a.tenant_id,a.faculty_user_id,a.faculty_user_id AS log_faculty_id,
                a.course_id,c.course_code,NULL::uuid AS timetable_id,
                a.adjustment_id AS class_adjustment_id,
                (a.new_date AT TIME ZONE 'Asia/Kolkata')::date AS class_date,
                NULL::text AS section,
                ((((a.new_date AT TIME ZONE 'Asia/Kolkata')::date)+($1::int+1))::timestamp
                  AT TIME ZONE 'Asia/Kolkata') AS deadline_at
         FROM class_adjustments a
         JOIN academic_courses c ON c.course_id=a.course_id AND c.tenant_id=a.tenant_id
         JOIN class_day d ON (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=d.date
         WHERE a.adjustment_type='EXTRA_CLASS' AND a.status IN ('APPROVED','NOTIFIED')
       ), candidates AS (
         SELECT * FROM regular UNION ALL SELECT * FROM moved UNION ALL SELECT * FROM extras
       )
       SELECT x.* FROM candidates x
       WHERE x.deadline_at BETWEEN $2::timestamptz-INTERVAL '2 minutes'
                               AND $2::timestamptz+INTERVAL '16 minutes'
         AND NOT EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=x.tenant_id AND cal.course_id=x.course_id
             AND cal.faculty_user_id=x.log_faculty_id AND cal.date=x.class_date
             AND ((x.timetable_id IS NOT NULL AND cal.timetable_id=x.timetable_id)
               OR (x.class_adjustment_id IS NOT NULL AND cal.class_adjustment_id=x.class_adjustment_id)))`,
      [this.lockDays(), now.toISOString()],
    );

    let sent = 0;
    for (const row of rows) {
      const remainingSeconds = Math.ceil(
        (new Date(row.deadline_at).getTime() - now.getTime()) / 1000,
      );
      const eventType =
        remainingSeconds <= 0
          ? 'LOCKED_MISSING'
          : remainingSeconds <= 5 * 60
            ? 'REMINDER_5'
            : remainingSeconds <= 15 * 60
              ? 'REMINDER_15'
              : null;
      if (!eventType) continue;
      const minutes = eventType === 'REMINDER_15' ? 15 : 5;
      const title =
        eventType === 'LOCKED_MISSING'
          ? 'Attendance locked — HOD approval required'
          : `Attendance locks in ${minutes} minutes`;
      const message =
        eventType === 'LOCKED_MISSING'
          ? `${row.course_code} attendance for ${row.class_date} was not submitted. Request a session unlock from your HOD.`
          : `${row.course_code} attendance for ${row.class_date} is incomplete. Submit it within ${minutes} minutes.`;
      sent += await this.persistNotification(row, eventType, title, message);
    }
    sent += await this.recordExpiredUnlocks();
    if (sent)
      this.logger.log(`Created ${sent} attendance deadline notification(s)`);
    return { candidates: rows.length, sent };
  }

  private async persistNotification(
    row: ReminderCandidate,
    eventType: 'REMINDER_15' | 'REMINDER_5' | 'LOCKED_MISSING',
    title: string,
    message: string,
  ) {
    const result = await this.dataSource.query<
      Array<{ notification_id: string }>
    >(
      `WITH event AS (
         INSERT INTO academic_attendance_workflow_events
           (tenant_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
            class_date,event_type,details)
         VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6::date,$7,$8::jsonb)
         ON CONFLICT DO NOTHING RETURNING event_id
       )
       INSERT INTO falcon_notifications
         (tenant_id,user_id,category,title,message,action_link,severity,intent,
          action_label,metadata,is_read,created_at)
       SELECT $1,$2,'ACADEMICS',$9,$10,'/faculty/attendance','warning','action_required',
              'Open attendance',$8::jsonb,false,NOW()
       FROM event RETURNING notification_id`,
      [
        row.tenant_id,
        row.faculty_user_id,
        row.course_id,
        row.timetable_id,
        row.class_adjustment_id,
        row.class_date,
        eventType,
        JSON.stringify({
          type: eventType,
          deadline_at: row.deadline_at,
          section: row.section,
        }),
        title,
        message,
      ],
    );
    return result.length > 0 ? 1 : 0;
  }

  private async recordExpiredUnlocks() {
    const rows = await this.dataSource.query<
      Array<{ notification_id: string }>
    >(
      `WITH expired AS (
         SELECT r.* FROM academic_attendance_unlock_requests r
         WHERE r.status='APPROVED' AND r.unlocked_until<=NOW()
           AND NOT EXISTS (SELECT 1 FROM academic_attendance_workflow_events e
             WHERE e.request_id=r.request_id AND e.event_type='RELOCKED')
       ), events AS (
         INSERT INTO academic_attendance_workflow_events
           (tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
            class_date,event_type,details)
         SELECT tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
                class_date,'RELOCKED',jsonb_build_object('unlocked_until',unlocked_until)
         FROM expired ON CONFLICT DO NOTHING RETURNING request_id
       )
       INSERT INTO falcon_notifications
         (tenant_id,user_id,category,title,message,action_link,severity,intent,
          action_label,metadata,is_read,created_at)
       SELECT r.tenant_id,r.faculty_user_id,'ACADEMICS','Attendance window expired',
              'The approved attendance window has closed. A new HOD approval is required to continue.',
              '/faculty/attendance','warning','status_update','View attendance',
              jsonb_build_object('request_id',r.request_id,'type','RELOCKED'),false,NOW()
       FROM academic_attendance_unlock_requests r JOIN events e ON e.request_id=r.request_id
       RETURNING notification_id`,
    );
    return rows.length;
  }
}

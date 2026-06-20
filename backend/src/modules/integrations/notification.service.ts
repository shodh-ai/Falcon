import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async notifyParent(studentUserId: string, message: string) {
    const rows = await this.db.query(
      `SELECT parent_mobile FROM parent_student_links WHERE student_user_id = $1`,
      [studentUserId],
    );
    for (const row of rows as Array<{ parent_mobile: string }>) {
      await this.queueWhatsApp(row.parent_mobile, message);
    }
  }

  async queueWhatsApp(to: string, message: string) {
    await this.db.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', 'WHATSAPP', 'alert', $1::jsonb)`,
      [JSON.stringify({ to, message, provider: 'MSG91_OR_TWILIO' })],
    );
    this.logger.log(`WhatsApp queued for ${to}`);
    return { queued: true };
  }

  async checkAttendanceAlerts() {
    const low = await this.db.query(
      `SELECT e.student_user_id, u.name, MIN(e.attendance_percent) AS min_att
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       GROUP BY e.student_user_id, u.name
       HAVING MIN(e.attendance_percent) < 75`,
    );
    for (const row of low as Array<{
      student_user_id: string;
      name: string;
      min_att: string;
    }>) {
      await this.notifyParent(
        row.student_user_id,
        `Attendance alert: ${row.name} is below 75% (${row.min_att}%).`,
      );
    }
    return { alerts_sent: low.length };
  }
}

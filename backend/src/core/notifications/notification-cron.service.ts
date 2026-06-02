import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEvents } from './notification.events';

@Injectable()
export class NotificationCronService {
  private readonly logger = new Logger(NotificationCronService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Midnight: library books past return date. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scanLibraryOverdue() {
    const rows = await this.dataSource.query<
      Array<{
        loan_id: string;
        tenant_id: string;
        student_user_id: string;
        title: string;
        due_date: string;
      }>
    >(
      `SELECT l.loan_id, l.tenant_id, l.student_user_id, b.title, l.due_date::text
       FROM operations_library_loans l
       JOIN operations_library_books b ON b.book_id = l.book_id
       WHERE l.returned_at IS NULL
         AND l.due_date < CURRENT_DATE
         AND l.overdue_notified_at IS NULL`,
    );

    for (const row of rows) {
      this.eventEmitter.emit(NotificationEvents.OPERATIONS_LIBRARY_OVERDUE, {
        tenantId: row.tenant_id,
        userId: row.student_user_id,
        bookTitle: row.title,
        dueDate: row.due_date,
        actionLink: '/student/library',
      });
      await this.dataSource.query(
        `UPDATE operations_library_loans SET overdue_notified_at = NOW() WHERE loan_id = $1`,
        [row.loan_id],
      );
    }

    if (rows.length) {
      this.logger.log(`Queued ${rows.length} library overdue notifications`);
    }
  }

  /** Daily 6 AM: attendance below 75% for enrolled students. */
  @Cron('0 6 * * *')
  async scanAttendanceWarnings() {
    const rows = await this.dataSource.query<
      Array<{
        student_user_id: string;
        tenant_id: string;
        min_att: string;
      }>
    >(
      `SELECT e.student_user_id,
              COALESCE(e.tenant_id, u.tenant_id) AS tenant_id,
              MIN(e.attendance_percent) AS min_att
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       GROUP BY e.student_user_id, COALESCE(e.tenant_id, u.tenant_id)
       HAVING MIN(e.attendance_percent) < 75`,
    );

    for (const row of rows) {
      const pct = Math.round(Number(row.min_att));
      this.eventEmitter.emit(NotificationEvents.ACADEMICS_ATTENDANCE_WARNING, {
        tenantId: row.tenant_id,
        userId: row.student_user_id,
        attendancePercent: pct,
        actionLink: '/student/attendance',
      });
    }

    if (rows.length) {
      this.logger.log(`Emitted ${rows.length} attendance warning notifications`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class ExamCellFinanceListener {
  private readonly logger = new Logger(ExamCellFinanceListener.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  /** Loop 2: Re-evaluation fee paid → surface in COE queue */
  @OnEvent('finance.demand_paid')
  async onDemandPaid(payload: { demandId: string; feeHead?: string; studentUserId?: string }) {
    if (payload.feeHead !== 'RE_EVALUATION') return;

    const rows = await this.db.query(
      `UPDATE exam_applications a
       SET fee_status = 'PAID', status = 'PENDING'
       FROM users u, academic_subjects sub
       WHERE a.finance_demand_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND u.user_id = a.student_user_id
         AND sub.subject_id = a.subject_id
       RETURNING a.exam_application_id, a.student_user_id, u.name AS student_name,
                 u.tenant_id, sub.subject_name, sub.subject_code`,
      [payload.demandId],
    );

    this.logger.log(`Re-evaluation application unlocked for demand ${payload.demandId}`);

    const row = rows[0] as {
      exam_application_id: string;
      student_user_id: string;
      student_name: string;
      tenant_id: string;
      subject_name: string;
      subject_code: string;
    } | undefined;

    if (row) {
      this.notify.examRevaluationFeePaid({
        tenantId: row.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
        userId: row.student_user_id,
        applicationId: row.exam_application_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        studentName: row.student_name,
      });
    }
  }
}

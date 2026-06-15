import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ExamCellFinanceListener {
  private readonly logger = new Logger(ExamCellFinanceListener.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Loop 2: Re-evaluation fee paid → surface in COE queue */
  @OnEvent('finance.demand_paid')
  async onDemandPaid(payload: { demandId: string; feeHead?: string; studentUserId?: string }) {
    if (payload.feeHead !== 'RE_EVALUATION') return;

    await this.db.query(
      `UPDATE exam_applications
       SET fee_status = 'PAID', status = 'PENDING'
       WHERE finance_demand_id = $1 AND application_type = 'RE_EVALUATION'`,
      [payload.demandId],
    );
    this.logger.log(`Re-evaluation application unlocked for demand ${payload.demandId}`);
  }
}

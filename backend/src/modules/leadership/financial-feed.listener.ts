import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FinancialFeedEmitter } from './financial-feed.emitter';

@Injectable()
export class FinancialFeedListener {
  private readonly logger = new Logger(FinancialFeedListener.name);

  constructor(
    private readonly feed: FinancialFeedEmitter,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @OnEvent('finance.demand_paid')
  async onDemandPaid(payload: {
    demandId: string;
    feeHead: string;
    studentUserId: string;
    amount?: number;
    tenantId?: string;
  }) {
    try {
      let tenantId = payload.tenantId;
      let amount = payload.amount;
      let programLabel = payload.feeHead;

      if (!tenantId || !amount) {
        const rows = await this.db.query(
          `SELECT u.tenant_id, d.fee_head, d.paid_amount, sp.program
           FROM finance_fee_demands d
           JOIN users u ON u.user_id = d.student_user_id
           LEFT JOIN student_profiles sp ON sp.user_id = d.student_user_id
           WHERE d.demand_id = $1`,
          [payload.demandId],
        );
        const row = rows[0] as {
          tenant_id: string;
          fee_head: string;
          paid_amount: string;
          program: string | null;
        };
        if (!row) return;
        tenantId = row.tenant_id;
        amount = Number(row.paid_amount);
        programLabel = row.program ? `${row.fee_head} (${row.program})` : row.fee_head;
      }

      await this.feed.emit({
        tenantId: tenantId!,
        eventType: 'INCOME',
        label: `Student Fee Received - ${programLabel}`,
        amount: amount ?? 0,
        metadata: { demand_id: payload.demandId, fee_head: payload.feeHead },
      });
    } catch (err) {
      this.logger.warn(`Feed emit failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('leadership.expense_created')
  async onExpenseCreated(payload: {
    tenantId: string;
    invoiceId: string;
    label: string;
    amount: number;
  }) {
    try {
      await this.feed.emit({
        tenantId: payload.tenantId,
        eventType: 'EXPENSE',
        label: payload.label,
        amount: payload.amount,
        metadata: { invoice_id: payload.invoiceId },
      });
    } catch (err) {
      this.logger.warn(`Expense feed emit failed: ${(err as Error).message}`);
    }
  }
}

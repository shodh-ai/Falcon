import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const CHEQUE_BOUNCE_PENALTY = 500;

@Injectable()
export class FinanceChequeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listPendingCheques(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM finance_transactions
       WHERE tenant_id = $1 AND gateway = 'CHEQUE' AND cheque_status = 'PENDING_CLEARANCE'
       ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async logCheque(
    tenantId: string,
    dto: {
      student_user_id: string;
      demand_id?: string;
      amount: number;
      cheque_number: string;
      bank_name: string;
    },
  ) {
    if (
      !dto.student_user_id ||
      !dto.cheque_number?.trim() ||
      !dto.bank_name?.trim()
    ) {
      throw new BadRequestException(
        'Student, cheque number, and bank name are required',
      );
    }
    const amount = Number(dto.amount);
    if (!amount || amount <= 0)
      throw new BadRequestException('Valid amount is required');

    const rows = await this.dataSource.query(
      `INSERT INTO finance_transactions (
         tenant_id, student_user_id, demand_id, gateway, payment_mode, amount,
         status, cheque_number, bank_name, cheque_status
       ) VALUES ($1,$2,$3,'CHEQUE','CHEQUE',$4,'INITIATED',$5,$6,'PENDING_CLEARANCE')
       RETURNING *`,
      [
        tenantId,
        dto.student_user_id,
        dto.demand_id ?? null,
        amount,
        dto.cheque_number.trim(),
        dto.bank_name.trim(),
      ],
    );
    const txn = rows[0];

    if (dto.demand_id) {
      await this.dataSource.query(
        `UPDATE finance_fee_demands
         SET fee_breakup = COALESCE(fee_breakup, '{}'::jsonb) || jsonb_build_object(
           'cheque_pending', true, 'cheque_transaction_id', $3::text
         )
         WHERE demand_id = $1 AND tenant_id = $2`,
        [dto.demand_id, tenantId, txn.transaction_id],
      );
    }

    return txn;
  }

  async markChequeCleared(
    tenantId: string,
    transactionId: string,
    clearanceDate?: string,
  ) {
    const cleared = clearanceDate ?? new Date().toISOString().slice(0, 10);
    const rows = await this.dataSource.query(
      `UPDATE finance_transactions
       SET status = 'SUCCESS', cheque_status = 'CLEARED', clearance_date = $3::date
       WHERE transaction_id = $1 AND tenant_id = $2 AND gateway = 'CHEQUE'
       RETURNING *`,
      [transactionId, tenantId, cleared],
    );
    const txn = rows[0];
    if (!txn) throw new BadRequestException('Cheque transaction not found');

    if (txn.demand_id) {
      await this.dataSource.query(
        `UPDATE finance_fee_demands
         SET paid_amount = COALESCE(paid_amount, 0) + $3,
             status = CASE WHEN COALESCE(paid_amount, 0) + $3 >= total_amount THEN 'PAID' ELSE 'PARTIALLY_PAID' END
         WHERE demand_id = $1 AND tenant_id = $2`,
        [txn.demand_id, tenantId, Number(txn.amount)],
      );
    }

    return txn;
  }

  async markChequeReturned(
    tenantId: string,
    transactionId: string,
    bounceReason: string,
  ) {
    if (!bounceReason?.trim())
      throw new BadRequestException('Bounce reason is required');

    const rows = await this.dataSource.query(
      `UPDATE finance_transactions
       SET status = 'FAILED', cheque_status = 'BOUNCED', bounce_reason = $3
       WHERE transaction_id = $1 AND tenant_id = $2 AND gateway = 'CHEQUE'
       RETURNING *`,
      [transactionId, tenantId, bounceReason.trim()],
    );
    const txn = rows[0];
    if (!txn) throw new BadRequestException('Cheque transaction not found');

    if (txn.demand_id) {
      await this.dataSource.query(
        `UPDATE finance_fee_demands SET status = 'OVERDUE' WHERE demand_id = $1 AND tenant_id = $2`,
        [txn.demand_id, tenantId],
      );
    }

    const studentUserId = txn.student_user_id;
    if (!studentUserId) return { transaction: txn, penalty_demand: null };

    const penaltyRows = await this.dataSource.query(
      `INSERT INTO finance_fee_demands (
         tenant_id, student_user_id, fee_head, total_amount, paid_amount, status, due_date, fee_breakup
       ) VALUES ($1,$2,'Cheque Bounce Penalty',$3,0,'PENDING',$4,$5::jsonb)
       RETURNING *`,
      [
        tenantId,
        studentUserId,
        CHEQUE_BOUNCE_PENALTY,
        new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        JSON.stringify({
          reason: 'CHEQUE_BOUNCE',
          original_transaction_id: txn.transaction_id,
        }),
      ],
    );

    this.notify.admitCardLocked({
      tenantId,
      userId: studentUserId,
      title: 'Admit card locked — cheque returned',
      message: `Your cheque was returned. A ₹${CHEQUE_BOUNCE_PENALTY} bounce penalty has been applied. Clear dues to unlock your admit card.`,
      actionLink: '/student/finance',
    });

    return { transaction: txn, penalty_demand: penaltyRows[0] };
  }
}

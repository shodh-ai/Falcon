import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const CHEQUE_BOUNCE_PENALTY = 500;
const APPROVED_SMOKE_CHEQUE = {
  tenantId: '65970c92-3b45-4eca-9421-10c6d1a323a5',
  studentId: 'aa989437-ede9-4576-81d3-a107b7c84766',
  transactionId: 'bc8baf67-d4a3-4de3-9e03-354268ea758d',
  demandId: '010b9ef0-02d3-4cdf-826c-3c002216038f',
} as const;

type ChequeTransaction = {
  transaction_id: string;
  tenant_id: string;
  student_user_id: string;
  demand_id: string | null;
  gateway: string;
  payment_mode: string | null;
  status: string;
  cheque_status: string;
  cheque_number: string;
  amount: number | string;
  deleted_at?: string | null;
};

type ChequeDemand = {
  demand_id: string;
  tenant_id: string;
  student_user_id: string;
  status: string;
  total_amount: number | string;
  paid_amount: number | string;
  fee_head: string;
  fee_breakup: Record<string, unknown> | null;
};

// TypeORM's PostgreSQL UPDATE/DELETE result is [rows, affectedCount].
// INSERT and SELECT return rows directly. Do not mistake the inner array for a row.
function queryRows<T>(result: unknown): T[] {
  const rows =
    Array.isArray(result) &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
      ? result[0]
      : result;
  if (!Array.isArray(rows))
    throw new BadRequestException('Unexpected cheque database response');
  return rows as T[];
}

function moneyCents(value: number | string): number {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(cents) ||
    Math.abs(amount * 100 - cents) > 0.00001
  )
    throw new BadRequestException('Valid two-decimal amount is required');
  return cents;
}

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
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(dto.student_user_id ?? '') ||
      (dto.demand_id && !uuid.test(dto.demand_id)) ||
      !dto.cheque_number?.trim() ||
      !dto.bank_name?.trim()
    ) {
      throw new BadRequestException(
        'Valid student ID, optional demand ID, cheque number and bank name are required',
      );
    }
    const tenant = tenantId?.trim();
    if (!tenant) throw new BadRequestException('Tenant context is required');
    const amountCents = moneyCents(dto.amount);
    if (!amountCents) throw new BadRequestException('Valid amount is required');
    const amount = amountCents / 100;
    return this.dataSource.transaction(async (manager) => {
      await this.assertStudent(manager, tenant, dto.student_user_id);
      if (dto.demand_id) {
        const demand = await this.lockDemand(
          manager,
          tenant,
          dto.student_user_id,
          dto.demand_id,
        );
        this.assertRemainingBalance(demand, amountCents);
      }
      const rows = queryRows<ChequeTransaction>(
        await manager.query(
          `INSERT INTO finance_transactions (
         tenant_id, student_user_id, demand_id, gateway, payment_mode, amount,
         status, cheque_number, bank_name, cheque_status
       ) VALUES ($1,$2,$3,'CHEQUE','CHEQUE',$4,'INITIATED',$5,$6,'PENDING_CLEARANCE')
       RETURNING *`,
          [
            tenant,
            dto.student_user_id,
            dto.demand_id ?? null,
            amount,
            dto.cheque_number.trim(),
            dto.bank_name.trim(),
          ],
        ),
      );
      const txn = rows[0];
      if (!txn) throw new BadRequestException('Cheque could not be logged');

      if (dto.demand_id) {
        await manager.query(
          `UPDATE finance_fee_demands
         SET fee_breakup = COALESCE(fee_breakup, '{}'::jsonb) || jsonb_build_object(
           'cheque_pending', true, 'cheque_transaction_id', $3::text
         )
         WHERE demand_id = $1 AND tenant_id = $2 AND student_user_id = $4`,
          [dto.demand_id, tenant, txn.transaction_id, dto.student_user_id],
        );
      }

      return txn;
    });
  }

  async markChequeCleared(
    tenantId: string,
    transactionId: string,
    clearanceDate?: string,
  ) {
    const cleared = clearanceDate ?? new Date().toISOString().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(cleared) ||
      !Number.isFinite(Date.parse(`${cleared}T00:00:00.000Z`)) ||
      new Date(`${cleared}T00:00:00.000Z`).toISOString().slice(0, 10) !==
        cleared
    )
      throw new BadRequestException('Valid clearance date is required');
    const tenant = tenantId?.trim();
    if (!tenant) throw new BadRequestException('Tenant context is required');

    return this.dataSource.transaction(async (manager) => {
      const txn = await this.lockCheque(manager, tenant, transactionId);
      await this.assertStudent(manager, tenant, txn.student_user_id);
      const amountCents = moneyCents(txn.amount);
      if (!amountCents)
        throw new BadRequestException('Valid cheque amount is required');
      const demand = txn.demand_id
        ? await this.lockDemand(
            manager,
            tenant,
            txn.student_user_id,
            txn.demand_id,
          )
        : null;

      // Never replay the financial effect of a previously cleared cheque.
      // Legacy inconsistencies require a separately reviewed reconciliation.
      if (txn.status === 'SUCCESS' && txn.cheque_status === 'CLEARED')
        return txn;
      if (
        txn.status !== 'INITIATED' ||
        txn.cheque_status !== 'PENDING_CLEARANCE'
      )
        throw new BadRequestException('Only a pending cheque may be cleared');
      if (demand) this.assertRemainingBalance(demand, amountCents);

      const updated = queryRows<ChequeTransaction>(
        await manager.query(
          `UPDATE finance_transactions
       SET status = 'SUCCESS', cheque_status = 'CLEARED', clearance_date = $3::date
       WHERE transaction_id = $1 AND tenant_id = $2 AND gateway = 'CHEQUE'
         AND student_user_id = $4 AND deleted_at IS NULL
         AND status = 'INITIATED' AND cheque_status = 'PENDING_CLEARANCE'
       RETURNING *`,
          [transactionId, tenant, cleared, txn.student_user_id],
        ),
      );
      if (updated.length !== 1)
        throw new BadRequestException('Cheque state changed before clearance');

      if (demand) {
        const balance = queryRows<ChequeDemand>(
          await manager.query(
            `UPDATE finance_fee_demands
         SET paid_amount = COALESCE(paid_amount, 0) + $3,
             status = CASE WHEN COALESCE(paid_amount, 0) + $3 >= total_amount THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
             fee_breakup = COALESCE(fee_breakup,'{}'::jsonb) || jsonb_build_object('cheque_pending',false,'cheque_transaction_id',$6::text),
             updated_at = NOW()
         WHERE demand_id = $1 AND tenant_id = $2 AND student_user_id = $4
           AND deleted_at IS NULL AND paid_amount = $5
           AND status IN ('PENDING','PARTIALLY_PAID','OVERDUE')
         RETURNING *`,
            [
              demand.demand_id,
              tenant,
              amountCents / 100,
              txn.student_user_id,
              moneyCents(demand.paid_amount) / 100,
              transactionId,
            ],
          ),
        );
        if (
          balance.length !== 1 ||
          moneyCents(balance[0].paid_amount) !==
            moneyCents(demand.paid_amount) + amountCents
        )
          throw new BadRequestException('Cheque balance update failed');
      }

      return updated[0];
    });
  }

  private async assertStudent(
    manager: Pick<DataSource, 'query'>,
    tenantId: string,
    studentId: string,
  ) {
    const students = queryRows<{ user_id: string; tenant_id: string }>(
      await manager.query(
        `SELECT u.user_id,u.tenant_id FROM users u
         WHERE u.user_id=$1 AND u.tenant_id=$2 AND u.deleted_at IS NULL AND u.is_active=true
           AND (EXISTS(SELECT 1 FROM roles r WHERE r.role_id=u.role_id AND r.role_name='Student')
             OR EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id
               WHERE ur.user_id=u.user_id AND r.role_name='Student'))`,
        [studentId, tenantId],
      ),
    );
    if (students.length !== 1 || students[0].tenant_id !== tenantId)
      throw new BadRequestException('Active student not found in this tenant');
  }

  private async lockCheque(
    manager: Pick<DataSource, 'query'>,
    tenantId: string,
    transactionId: string,
  ) {
    const rows = queryRows<ChequeTransaction>(
      await manager.query(
        `SELECT * FROM finance_transactions
       WHERE transaction_id=$1 AND tenant_id=$2 AND gateway='CHEQUE' AND deleted_at IS NULL
       FOR UPDATE`,
        [transactionId, tenantId],
      ),
    );
    const txn = rows[0];
    if (
      rows.length !== 1 ||
      txn.tenant_id !== tenantId ||
      !txn.student_user_id ||
      txn.gateway !== 'CHEQUE'
    )
      throw new BadRequestException('Cheque transaction not found');
    return txn;
  }

  private async lockDemand(
    manager: Pick<DataSource, 'query'>,
    tenantId: string,
    studentId: string,
    demandId: string,
  ) {
    const rows = queryRows<ChequeDemand>(
      await manager.query(
        `SELECT * FROM finance_fee_demands
       WHERE demand_id=$1 AND tenant_id=$2 AND student_user_id=$3 AND deleted_at IS NULL
       FOR UPDATE`,
        [demandId, tenantId, studentId],
      ),
    );
    const demand = rows[0];
    if (
      rows.length !== 1 ||
      demand.tenant_id !== tenantId ||
      demand.student_user_id !== studentId
    )
      throw new BadRequestException(
        'Student fee demand not found in this tenant',
      );
    return demand;
  }

  private assertRemainingBalance(demand: ChequeDemand, amountCents: number) {
    const remaining =
      moneyCents(demand.total_amount) - moneyCents(demand.paid_amount);
    if (
      !['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(demand.status) ||
      remaining < amountCents
    )
      throw new BadRequestException(
        'Cheque exceeds the remaining payable balance',
      );
  }

  /** No HTTP route: one explicitly approved, legacy-cleared synthetic fixture only. */
  async recoverApprovedSmokeCheque(tenantId: string, transactionId: string) {
    const options = this.dataSource.options as {
      type?: string;
      host?: string;
      port?: number;
      database?: string;
    };
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.FALCON_SMOKE_ENABLE !== '1' ||
      options.type !== 'postgres' ||
      !['localhost', '127.0.0.1', '::1'].includes(options.host || '') ||
      Number(options.port) !== 5433 ||
      options.database !== 'university_governance' ||
      tenantId !== APPROVED_SMOKE_CHEQUE.tenantId ||
      transactionId !== APPROVED_SMOKE_CHEQUE.transactionId
    )
      throw new BadRequestException(
        'Approved local synthetic cheque recovery only',
      );

    return this.dataSource.transaction(async (manager) => {
      const identity = queryRows<{
        database: string;
        subdomain: string;
        settings: { smoke_test?: { seed?: string; synthetic?: boolean } };
        official_email: string;
      }>(
        await manager.query(
          `SELECT current_database() AS database,t.subdomain,t.settings,u.official_email
         FROM public.tenants t JOIN users u ON u.tenant_id=t.tenant_id
         WHERE t.tenant_id=$1 AND t.is_active=true AND u.user_id=$2 AND u.deleted_at IS NULL AND u.is_active=true`,
          [tenantId, APPROVED_SMOKE_CHEQUE.studentId],
        ),
      );
      if (
        identity.length !== 1 ||
        identity[0].database !== 'university_governance' ||
        identity[0].subdomain !== 'falcon-student-smoke' ||
        identity[0].settings?.smoke_test?.seed !==
          'student.complete-smoke.v1' ||
        identity[0].settings?.smoke_test?.synthetic !== true ||
        !identity[0].official_email?.toLowerCase().endsWith('.invalid')
      )
        throw new BadRequestException(
          'Synthetic recovery tenant/student identity mismatch',
        );
      const txn = await this.lockCheque(manager, tenantId, transactionId);
      await this.assertStudent(
        manager,
        tenantId,
        APPROVED_SMOKE_CHEQUE.studentId,
      );
      if (
        txn.student_user_id !== APPROVED_SMOKE_CHEQUE.studentId ||
        txn.demand_id !== APPROVED_SMOKE_CHEQUE.demandId ||
        txn.status !== 'SUCCESS' ||
        txn.cheque_status !== 'CLEARED' ||
        txn.payment_mode !== 'CHEQUE' ||
        txn.cheque_number !== '[SMOKE v1] PARTIAL-aa989437' ||
        moneyCents(txn.amount) !== 500000
      )
        throw new BadRequestException(
          'Approved synthetic cleared cheque evidence mismatch',
        );
      const demand = await this.lockDemand(
        manager,
        tenantId,
        txn.student_user_id,
        APPROVED_SMOKE_CHEQUE.demandId,
      );
      const breakup = demand.fee_breakup || {};
      const allowedKeys = [
        'tuition_fee',
        'development_fee',
        'exam_fee',
        'cheque_pending',
        'cheque_transaction_id',
      ];
      if (
        demand.fee_head !== '[SMOKE v1] Partial semester fee' ||
        moneyCents(demand.total_amount) !== 2000000 ||
        Object.keys(breakup).some((key) => !allowedKeys.includes(key)) ||
        moneyCents(Number(breakup.tuition_fee)) !== 1700000 ||
        moneyCents(Number(breakup.development_fee)) !== 200000 ||
        moneyCents(Number(breakup.exam_fee)) !== 100000 ||
        breakup.cheque_transaction_id !== transactionId
      )
        throw new BadRequestException(
          'Synthetic recovery demand has unexpected adjustments',
        );
      const payments = queryRows<ChequeTransaction>(
        await manager.query(
          `SELECT * FROM finance_transactions WHERE demand_id=$1 FOR UPDATE`,
          [demand.demand_id],
        ),
      );
      if (
        payments.length !== 1 ||
        payments[0].transaction_id !== transactionId ||
        payments[0].tenant_id !== tenantId ||
        payments[0].student_user_id !== txn.student_user_id ||
        payments[0].status !== 'SUCCESS' ||
        moneyCents(payments[0].amount) !== 500000
      )
        throw new BadRequestException(
          'Synthetic recovery requires exactly the approved valid payment',
        );
      if (
        moneyCents(demand.paid_amount) === 500000 &&
        demand.status === 'PARTIALLY_PAID'
      )
        return {
          recovered: false,
          transaction_id: transactionId,
          demand_id: demand.demand_id,
          paid_amount: 5000,
          status: demand.status,
        };
      if (moneyCents(demand.paid_amount) !== 0 || demand.status !== 'PENDING')
        throw new BadRequestException(
          'Synthetic recovery cannot overwrite an existing balance',
        );
      const restored = queryRows<ChequeDemand>(
        await manager.query(
          `UPDATE finance_fee_demands SET paid_amount=$3,status='PARTIALLY_PAID',updated_at=NOW(),
           fee_breakup = COALESCE(fee_breakup,'{}'::jsonb) || jsonb_build_object('cheque_pending',false,'cheque_transaction_id',$5::text)
         WHERE demand_id=$1 AND tenant_id=$2 AND student_user_id=$4 AND paid_amount=0
           AND status='PENDING' AND deleted_at IS NULL RETURNING *`,
          [
            demand.demand_id,
            tenantId,
            5000,
            txn.student_user_id,
            transactionId,
          ],
        ),
      );
      if (
        restored.length !== 1 ||
        moneyCents(restored[0].paid_amount) !== 500000 ||
        restored[0].status !== 'PARTIALLY_PAID'
      )
        throw new BadRequestException(
          'Synthetic cheque recovery failed atomically',
        );
      return {
        recovered: true,
        transaction_id: transactionId,
        demand_id: demand.demand_id,
        paid_amount: 5000,
        status: restored[0].status,
      };
    });
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

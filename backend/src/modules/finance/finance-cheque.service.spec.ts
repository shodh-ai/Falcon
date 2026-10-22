import { BadRequestException } from '@nestjs/common';
import { FinanceChequeService } from './finance-cheque.service';

describe('FinanceChequeService', () => {
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const notify = { admitCardLocked: jest.fn() };
  let service: FinanceChequeService;

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.transaction.mockImplementation(
      (work: (manager: typeof dataSource) => unknown) => work(dataSource),
    );
    service = new FinanceChequeService(dataSource as never, notify as never);
  });

  it('rejects cheque log without required fields', async () => {
    await expect(
      service.logCheque('t1', {
        student_user_id: '',
        amount: 100,
        cheque_number: '',
        bank_name: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a client error for a malformed student or demand ID before querying PostgreSQL', async () => {
    await expect(service.logCheque('t1', {
      student_user_id: 'not-a-uuid',
      demand_id: 'also-invalid',
      amount: 100,
      cheque_number: 'CHQ001',
      bank_name: 'Test Bank',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('logs cheque with PENDING_CLEARANCE status', async () => {
    const studentId = 'aa989437-ede9-4576-81d3-a107b7c84766';
    const demandId = '010b9ef0-02d3-4cdf-826c-3c002216038f';
    dataSource.query
      .mockResolvedValueOnce([{ user_id: studentId, tenant_id: 't1' }])
      .mockResolvedValueOnce([
        {
          demand_id: demandId,
          tenant_id: 't1',
          student_user_id: studentId,
          status: 'PENDING',
          total_amount: 10000,
          paid_amount: 0,
        },
      ])
      .mockResolvedValueOnce([{ transaction_id: 'tx1', amount: 5000 }])
      .mockResolvedValueOnce([]);

    const txn = await service.logCheque('t1', {
      student_user_id: studentId,
      demand_id: demandId,
      amount: 5000,
      cheque_number: 'CHQ001',
      bank_name: 'Test Bank',
    });

    expect(txn.transaction_id).toBe('tx1');
    const queries = dataSource.query.mock.calls as unknown[][];
    expect(queries[2][0]).toMatch(/PENDING_CLEARANCE/);
  });

  it('marks cheque returned and creates bounce penalty', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { transaction_id: 'tx1', student_user_id: 'stu-1', demand_id: 'dem-1' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ demand_id: 'pen-1', total_amount: 500 }]);

    const result = await service.markChequeReturned(
      't1',
      'tx1',
      'Insufficient funds',
    );

    const penalty = result.penalty_demand as { total_amount: number };
    expect(penalty.total_amount).toBe(500);
    expect(notify.admitCardLocked).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'stu-1', tenantId: 't1' }),
    );
  });
});

const APPROVED = {
  tenant: '65970c92-3b45-4eca-9421-10c6d1a323a5',
  student: 'aa989437-ede9-4576-81d3-a107b7c84766',
  transaction: 'bc8baf67-d4a3-4de3-9e03-354268ea758d',
  demand: '010b9ef0-02d3-4cdf-826c-3c002216038f',
};

function transactionHarness() {
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const state = {
    studentValid: true,
    failBalance: false,
    txn: {
      transaction_id: APPROVED.transaction,
      tenant_id: APPROVED.tenant,
      student_user_id: APPROVED.student,
      demand_id: APPROVED.demand,
      gateway: 'CHEQUE',
      payment_mode: 'CHEQUE',
      status: 'INITIATED',
      cheque_status: 'PENDING_CLEARANCE',
      cheque_number: '[SMOKE v1] PARTIAL-aa989437',
      amount: '5000.00',
      deleted_at: null,
    },
    demand: {
      demand_id: APPROVED.demand,
      tenant_id: APPROVED.tenant,
      student_user_id: APPROVED.student,
      status: 'PENDING',
      total_amount: '20000.00',
      paid_amount: '0.00',
      fee_head: '[SMOKE v1] Partial semester fee',
      fee_breakup: {
        tuition_fee: 17000,
        development_fee: 2000,
        exam_fee: 1000,
        cheque_pending: true,
        cheque_transaction_id: APPROVED.transaction,
      } as Record<string, unknown>,
    },
    identity: {
      database: 'university_governance',
      subdomain: 'falcon-student-smoke',
      settings: {
        smoke_test: { seed: 'student.complete-smoke.v1', synthetic: true },
      },
      official_email: 'student@falcon-smoke.invalid',
    },
    otherPayments: [] as Array<Record<string, unknown>>,
    committed: 0,
    rolledBack: 0,
  };
  const manager = {
    query: jest.fn((sql: string, args: unknown[]) => {
      if (sql.includes('FROM public.tenants')) return [copy(state.identity)];
      if (sql.includes('FROM users u'))
        return state.studentValid
          ? [{ user_id: args[0], tenant_id: args[1] }]
          : [];
      if (sql.includes('SELECT * FROM finance_transactions')) {
        if (sql.includes('WHERE demand_id='))
          return [copy(state.txn), ...copy(state.otherPayments)];
        return state.txn.transaction_id === args[0] &&
          state.txn.tenant_id === args[1] &&
          !state.txn.deleted_at
          ? [copy(state.txn)]
          : [];
      }
      if (sql.includes('SELECT * FROM finance_fee_demands'))
        return state.demand.demand_id === args[0] &&
          state.demand.tenant_id === args[1] &&
          state.demand.student_user_id === args[2]
          ? [copy(state.demand)]
          : [];
      if (sql.includes('UPDATE finance_transactions')) {
        state.txn.status = 'SUCCESS';
        state.txn.cheque_status = 'CLEARED';
        return [[copy(state.txn)], 1]; // Actual installed TypeORM PostgreSQL shape.
      }
      if (sql.includes('UPDATE finance_fee_demands')) {
        if (state.failBalance)
          throw new Error('Simulated database balance write failure');
        const recovering = sql.includes('SET paid_amount=$3');
        state.demand.paid_amount = String(
          recovering
            ? Number(args[2])
            : Number(state.demand.paid_amount) + Number(args[2]),
        );
        state.demand.status =
          Number(state.demand.paid_amount) >= Number(state.demand.total_amount)
            ? 'PAID'
            : 'PARTIALLY_PAID';
        state.demand.fee_breakup.cheque_pending = false;
        return [[copy(state.demand)], 1];
      }
      throw new Error(`Unexpected test SQL: ${sql}`);
    }),
  };
  const source = {
    query: jest.fn(),
    options: {
      type: 'postgres',
      host: '127.0.0.1',
      port: 5433,
      database: 'university_governance',
    },
    transaction: jest.fn(
      async (work: (value: typeof manager) => Promise<unknown>) => {
        const snapshot = copy({ txn: state.txn, demand: state.demand });
        try {
          const result = await work(manager);
          state.committed += 1;
          return result;
        } catch (error) {
          state.txn = snapshot.txn;
          state.demand = snapshot.demand;
          state.rolledBack += 1;
          throw error;
        }
      },
    ),
  };
  const service = new FinanceChequeService(
    source as never,
    { admitCardLocked: jest.fn() } as never,
  );
  return { state, source, manager, service };
}

describe('FinanceChequeService atomic clearance', () => {
  it('uses actual UPDATE shape and clears exactly once with a reconciled object response', async () => {
    const { state, service, manager } = transactionHarness();
    const cleared = await service.markChequeCleared(
      APPROVED.tenant,
      APPROVED.transaction,
      '2026-10-14',
    );
    expect(cleared.transaction_id).toBe(APPROVED.transaction);
    expect(cleared.status).toBe('SUCCESS');
    expect(state.demand.paid_amount).toBe('5000');
    expect(state.demand.status).toBe('PARTIALLY_PAID');
    expect(state.demand.fee_breakup.cheque_pending).toBe(false);
    expect(state.demand.fee_breakup.tuition_fee).toBe(17000);
    expect(
      manager.query.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE')),
    ).toHaveLength(2);
    const updates = manager.query.mock.calls.filter(
      ([sql]) =>
        sql.startsWith('UPDATE') || sql.trimStart().startsWith('UPDATE'),
    ).length;
    await service.markChequeCleared(
      APPROVED.tenant,
      APPROVED.transaction,
      '2026-10-15',
    );
    expect(state.demand.paid_amount).toBe('5000');
    expect(
      manager.query.mock.calls.filter(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toHaveLength(updates);
  });

  it('does not silently repair an already-cleared legacy real cheque balance', async () => {
    const { state, service, manager } = transactionHarness();
    state.txn.status = 'SUCCESS';
    state.txn.cheque_status = 'CLEARED';
    await service.markChequeCleared(APPROVED.tenant, APPROVED.transaction);
    expect(state.demand.paid_amount).toBe('0.00');
    expect(
      manager.query.mock.calls.some(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toBe(false);
  });

  it('rolls back the cheque status when its balance write fails', async () => {
    const { state, service } = transactionHarness();
    state.failBalance = true;
    await expect(
      service.markChequeCleared(APPROVED.tenant, APPROVED.transaction),
    ).rejects.toThrow('balance write failure');
    expect(state.txn.status).toBe('INITIATED');
    expect(state.txn.cheque_status).toBe('PENDING_CLEARANCE');
    expect(state.demand.paid_amount).toBe('0.00');
    expect(state.committed).toBe(0);
    expect(state.rolledBack).toBe(1);
  });

  it.each([
    'foreign transaction',
    'foreign student',
    'foreign demand',
    'inactive student',
  ])('rejects %s before any update', async (kind) => {
    const { state, service, manager } = transactionHarness();
    if (kind === 'foreign transaction') state.txn.tenant_id = 'other-tenant';
    if (kind === 'foreign student') state.txn.student_user_id = 'other-student';
    if (kind === 'foreign demand') state.demand.tenant_id = 'other-tenant';
    if (kind === 'inactive student') state.studentValid = false;
    await expect(
      service.markChequeCleared(APPROVED.tenant, APPROVED.transaction),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      manager.query.mock.calls.some(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toBe(false);
  });

  it.each([0, -1, 20000.01, 10.001, NaN, Infinity])(
    'rejects invalid or excess amount %s',
    async (amount) => {
      const { state, service, manager } = transactionHarness();
      state.txn.amount = String(amount);
      await expect(
        service.markChequeCleared(APPROVED.tenant, APPROVED.transaction),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        manager.query.mock.calls.some(([sql]) =>
          sql.trimStart().startsWith('UPDATE'),
        ),
      ).toBe(false);
    },
  );

  it('limits clearance to the remaining balance, not invoice total', async () => {
    const { state, service } = transactionHarness();
    state.demand.paid_amount = '17000.00';
    state.demand.status = 'PARTIALLY_PAID';
    await expect(
      service.markChequeCleared(APPROVED.tenant, APPROVED.transaction),
    ).rejects.toThrow('remaining payable');
  });

  it('fully pays a demand with an exact remaining cheque', async () => {
    const { state, service } = transactionHarness();
    state.demand.paid_amount = '15000.00';
    state.demand.status = 'PARTIALLY_PAID';
    await service.markChequeCleared(APPROVED.tenant, APPROVED.transaction);
    expect(state.demand.paid_amount).toBe('20000');
    expect(state.demand.status).toBe('PAID');
  });

  it.each(['2026-02-30', 'not-a-date'])(
    'rejects invalid clearance date %s before connecting',
    async (date) => {
      const { source, service } = transactionHarness();
      await expect(
        service.markChequeCleared(APPROVED.tenant, APPROVED.transaction, date),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(source.transaction).not.toHaveBeenCalled();
    },
  );
});

describe('FinanceChequeService approved synthetic recovery only', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalEnable = process.env.FALCON_SMOKE_ENABLE;
  const originalNodeEnv = process.env.NODE_ENV;
  beforeEach(() => {
    mutableEnv.NODE_ENV = 'test';
    process.env.FALCON_SMOKE_ENABLE = '1';
  });
  afterEach(() => {
    if (originalEnable === undefined) delete process.env.FALCON_SMOKE_ENABLE;
    else process.env.FALCON_SMOKE_ENABLE = originalEnable;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
  });

  function recoveryHarness() {
    const value = transactionHarness();
    value.state.txn.status = 'SUCCESS';
    value.state.txn.cheque_status = 'CLEARED';
    return value;
  }

  it('restores only the approved payment amount once and repeated recovery is read-only', async () => {
    const { state, service, manager } = recoveryHarness();
    const first = await service.recoverApprovedSmokeCheque(
      APPROVED.tenant,
      APPROVED.transaction,
    );
    expect(first.recovered).toBe(true);
    expect(state.demand.paid_amount).toBe('5000');
    expect(state.demand.status).toBe('PARTIALLY_PAID');
    expect(state.demand.fee_breakup.cheque_pending).toBe(false);
    expect(state.demand.fee_breakup.cheque_transaction_id).toBe(
      APPROVED.transaction,
    );
    expect(state.demand.fee_breakup.exam_fee).toBe(1000);
    const repeat = await service.recoverApprovedSmokeCheque(
      APPROVED.tenant,
      APPROVED.transaction,
    );
    expect(repeat.recovered).toBe(false);
    expect(
      manager.query.mock.calls.filter(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toHaveLength(1);
  });

  it.each([
    'production',
    'disabled',
    'remote',
    'wrong port',
    'wrong database',
    'wrong tenant',
    'wrong transaction',
  ])('rejects %s before database access', async (kind) => {
    const { source, service } = recoveryHarness();
    if (kind === 'production') mutableEnv.NODE_ENV = 'production';
    if (kind === 'disabled') delete process.env.FALCON_SMOKE_ENABLE;
    if (kind === 'remote') source.options.host = 'database.example.com';
    if (kind === 'wrong port') source.options.port = 5432;
    if (kind === 'wrong database') source.options.database = 'production';
    await expect(
      service.recoverApprovedSmokeCheque(
        kind === 'wrong tenant' ? 'foreign' : APPROVED.tenant,
        kind === 'wrong transaction' ? 'foreign' : APPROVED.transaction,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(source.transaction).not.toHaveBeenCalled();
  });

  it.each([
    'no marker',
    'real email',
    'wrong database',
    'wrong amount',
    'wrong demand',
    'not cleared',
    'adjustments',
    'other payment',
    'existing balance',
  ])('rejects %s without recovery update', async (kind) => {
    const { state, service, manager } = recoveryHarness();
    if (kind === 'no marker')
      state.identity.settings.smoke_test.synthetic = false;
    if (kind === 'real email')
      state.identity.official_email = 'real@student.example.edu';
    if (kind === 'wrong database') state.identity.database = 'production';
    if (kind === 'wrong amount') state.txn.amount = '6000.00';
    if (kind === 'wrong demand') state.txn.demand_id = 'foreign';
    if (kind === 'not cleared') state.txn.status = 'INITIATED';
    if (kind === 'adjustments')
      state.demand.fee_breakup.scholarship_discount_percent = 25;
    if (kind === 'other payment')
      state.otherPayments.push({ transaction_id: 'another' });
    if (kind === 'existing balance') state.demand.paid_amount = '1000';
    await expect(
      service.recoverApprovedSmokeCheque(APPROVED.tenant, APPROVED.transaction),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      manager.query.mock.calls.some(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toBe(false);
  });

  it('rolls back a failing approved synthetic recovery without changing the transaction', async () => {
    const { state, service } = recoveryHarness();
    state.failBalance = true;
    await expect(
      service.recoverApprovedSmokeCheque(APPROVED.tenant, APPROVED.transaction),
    ).rejects.toThrow('balance write failure');
    expect(state.txn.status).toBe('SUCCESS');
    expect(state.demand.paid_amount).toBe('0.00');
    expect(state.rolledBack).toBe(1);
  });
});

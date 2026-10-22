import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StudentPortalService } from './student-portal.service';
jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

describe('Student payment ownership and settlement', () => {
  function setup(
    options: {
      existing?: boolean;
      missingDemand?: boolean;
      missingOrder?: boolean;
      orderAmount?: string;
      lockedAmount?: string;
      missingIntent?: boolean;
      commitFails?: boolean;
    } = {},
  ) {
    let committed = false;
    const transaction = {
      transaction_id: 'transaction',
      demand_id: 'demand',
      receipt_url: '/uploads/own-receipt.pdf',
      amount: '100.00',
    };
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes("t.gateway_payment_id = $1 AND t.status = 'SUCCESS'")
          ? options.existing
            ? [transaction]
            : []
          : sql.includes('SELECT d.demand_id')
            ? options.missingDemand
              ? []
              : [
                  {
                    demand_id: 'demand',
                    fee_head: 'RE_EVALUATION',
                    total_amount: '100',
                    paid_amount: '0',
                    status: 'PENDING',
                  },
                ]
            : sql.includes('SELECT t.gateway_order_id')
              ? options.missingOrder
                ? []
                : [
                    {
                      gateway_order_id: 'order_own',
                      amount: options.orderAmount ?? '100',
                    },
                  ]
              : [],
      ),
    );
    const manager = {
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('FOR UPDATE')
            ? [
                {
                  demand_id: 'demand',
                  total_amount: options.lockedAmount ?? '100',
                  paid_amount: '0',
                  status: 'PENDING',
                },
              ]
            : sql.includes('UPDATE finance_transactions')
              ? options.missingIntent
                ? []
                : [transaction]
              : [],
        ),
      ),
    };
    const dataSource = {
      query,
      transaction: jest.fn(
        async (work: (executor: typeof manager) => Promise<unknown>) => {
          const value = await work(manager);
          if (options.commitFails) throw new Error('Synthetic commit failure');
          committed = true;
          return value;
        },
      ),
    };
    const gateway = {
      createOrder: jest.fn().mockResolvedValue({
        order_id: 'order_own',
        amount_paise: 10000,
        currency: 'INR',
        razorpay_key: 'unit',
        mock: false,
      }),
      verifyPayment: jest.fn().mockResolvedValue({
        payment_id: 'pay_captured_own',
        order_id: 'order_own',
        amount_paise: 10000,
        status: 'captured',
        method: 'UPI',
        mock: false,
      }),
    };
    const events = {
      emit: jest.fn(() => {
        expect(committed).toBe(true);
      }),
    };
    const receipts = {
      generateAndStore: jest.fn().mockResolvedValue('/uploads/own-receipt.pdf'),
    };
    const unused = {} as never;
    const service = new StudentPortalService(
      dataSource as never,
      unused,
      unused,
      events as never,
      unused,
      unused,
      unused,
      unused,
      receipts as never,
      gateway as never,
      unused,
      unused,
    );
    const ledger = jest
      .spyOn(service, 'getFinanceLedger')
      .mockImplementation(
        () => Promise.resolve({ gates: { admit_card_locked: false } }) as never,
      );
    return { service, query, manager, dataSource, gateway, events, ledger };
  }
  const input = {
    demand_id: 'demand',
    payment_id: 'pay_captured_own',
    order_id: 'order_own',
  };

  it('cannot rebind an existing gateway order or reset a settled intent', async () => {
    const { service, query } = setup();
    await expect(
      service.createPaymentOrder('student', 'demand', 'tenant'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND finance_transactions.status = 'INITIATED'"),
      expect.arrayContaining(['student', 'demand', 'order_own']),
    );
    expect(query.mock.calls[1][0]).toContain(
      'finance_transactions.student_user_id = $1 AND finance_transactions.demand_id = $2',
    );
  });

  it('returns an existing receipt only from the exact authenticated demand/student/tenant scope', async () => {
    const { service, query, gateway } = setup({ existing: true });
    const result = await service.confirmVerifiedPayment(
      'student',
      'tenant',
      input,
    );
    expect(result).toEqual(
      expect.objectContaining({
        already_paid: true,
        receipt_url: '/uploads/own-receipt.pdf',
      }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'AND t.student_user_id = $2 AND t.demand_id = $3 AND d.tenant_id = $4',
      ),
      ['pay_captured_own', 'student', 'demand', 'tenant'],
    );
    expect(query.mock.calls[0][0]).toContain('u.tenant_id = d.tenant_id');
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
  });
  it('cannot expose a receipt when the authenticated student does not own the demand', async () => {
    const { service, gateway, ledger } = setup({ missingDemand: true });
    await expect(
      service.confirmVerifiedPayment(
        'foreign-student',
        'foreign-tenant',
        input,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });
  it.each([{ missingOrder: true }, { orderAmount: '99' }])(
    'rejects an absent or stale/mismatched owned checkout order: %j',
    async (option) => {
      const { service, gateway, dataSource, query } = setup(option);
      await expect(
        service.confirmVerifiedPayment('student', 'tenant', input),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.verifyPayment).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'AND ($4::text IS NULL OR t.gateway_order_id = $4)',
        ),
        ['student', 'demand', 'tenant', 'order_own'],
      );
    },
  );
  it('verifies owned order, demand, student, tenant and exact amount; emits and reads gates after commit', async () => {
    const { service, gateway, events, manager } = setup();
    const result = await service.confirmVerifiedPayment(
      'student',
      'tenant',
      input,
    );
    expect(gateway.verifyPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAmountPaise: 10000,
        expectedOrderId: 'order_own',
        expectedDemandId: 'demand',
        expectedStudentUserId: 'student',
        expectedTenantId: 'tenant',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        gates: { admit_card_locked: false },
      }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('AND tenant_id = $3\n         FOR UPDATE'),
      ['demand', 'student', 'tenant'],
    );
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
  it.each([{ lockedAmount: '90' }, { missingIntent: true }])(
    'rejects settlement when the balance/order changes during verification: %j',
    async (option) => {
      const { service, events } = setup(option);
      await expect(
        service.confirmVerifiedPayment('student', 'tenant', input),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.emit).not.toHaveBeenCalled();
    },
  );
  it('does not publish a paid event or refreshed gates when commit fails', async () => {
    const { service, events, ledger } = setup({ commitFails: true });
    await expect(
      service.confirmVerifiedPayment('student', 'tenant', input),
    ).rejects.toThrow('Synthetic commit failure');
    expect(events.emit).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import { FinanceChequeService } from './finance-cheque.service';

describe('FinanceChequeService', () => {
  const dataSource = { query: jest.fn() };
  const notify = { admitCardLocked: jest.fn() };
  let service: FinanceChequeService;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('logs cheque with PENDING_CLEARANCE status', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ transaction_id: 'tx1', amount: 5000 }])
      .mockResolvedValueOnce([]);

    const txn = await service.logCheque('t1', {
      student_user_id: 'stu-1',
      demand_id: 'dem-1',
      amount: 5000,
      cheque_number: 'CHQ001',
      bank_name: 'Test Bank',
    });

    expect(txn.transaction_id).toBe('tx1');
    expect(dataSource.query.mock.calls[0][0]).toMatch(/PENDING_CLEARANCE/);
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

    expect(result.penalty_demand.total_amount).toBe(500);
    expect(notify.admitCardLocked).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'stu-1', tenantId: 't1' }),
    );
  });
});

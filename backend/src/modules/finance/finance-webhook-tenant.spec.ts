import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { FinanceWebhookService } from './finance-webhook.service';

describe('Finance webhook tenant identity', () => {
  const transactions = {
    findOne: jest.fn(),
    create: jest.fn((value: Record<string, unknown>) => ({
      transaction_id: 'transaction-a',
      ...value,
    })),
    save: jest.fn(async (value: unknown) => value),
  };
  const demands = { findOne: jest.fn(), save: jest.fn() };
  const dataSource = { query: jest.fn() };
  const receipts = {
    generateAndStore: jest.fn().mockResolvedValue('private-receipt-key'),
    emailReceipt: jest.fn().mockResolvedValue(undefined),
  };
  const ledger = { postFeePayment: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const wallet = { topUp: jest.fn() };
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  let service: FinanceWebhookService;

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test-only-webhook-secret';
  });
  afterAll(() => {
    if (previousSecret === undefined)
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    transactions.findOne.mockResolvedValue(null);
    service = new FinanceWebhookService(
      transactions as never,
      demands as never,
      dataSource as never,
      receipts as never,
      ledger as never,
      events as never,
      wallet as never,
    );
  });

  const webhook = (notes: Record<string, unknown>) => {
    const payload = {
      payment: {
        entity: {
          id: 'payment-a',
          order_id: 'order-a',
          amount: 10000,
          notes,
        },
      },
    };
    return {
      event: 'payment.captured',
      payload,
      signature: createHmac('sha256', 'test-only-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex'),
    };
  };

  it('rejects signed notes that claim another tenant', async () => {
    dataSource.query.mockResolvedValueOnce([{ tenant_id: 'tenant-a' }]);
    await expect(
      service.handleGatewayWebhook(
        'razorpay',
        webhook({ student_user_id: 'student-a', tenant_id: 'tenant-b' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transactions.save).not.toHaveBeenCalled();
  });

  it('persists the authoritative student tenant, not an unverified fallback', async () => {
    dataSource.query.mockResolvedValueOnce([{ tenant_id: 'tenant-a' }]);
    await service.handleGatewayWebhook(
      'razorpay',
      webhook({ student_user_id: 'student-a', tenant_id: 'tenant-a' }),
    );
    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-a' }),
    );
    expect(ledger.postFeePayment).toHaveBeenCalledWith(
      'tenant-a',
      'transaction-a',
      100,
      expect.any(Object),
    );
  });
});

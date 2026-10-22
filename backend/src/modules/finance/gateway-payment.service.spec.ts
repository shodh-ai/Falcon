import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GatewayPaymentService } from './gateway-payment.service';

describe('GatewayPaymentService', () => {
  const prev = { ...process.env };
  const originalFetch = Object.getOwnPropertyDescriptor(global, 'fetch');

  afterEach(() => {
    process.env = { ...prev };
    jest.restoreAllMocks();
    if (originalFetch) Object.defineProperty(global, 'fetch', originalFetch);
    else delete (global as { fetch?: typeof fetch }).fetch;
  });

  it('rejects mock payments without ALLOW_MOCK_PAYMENTS (any NODE_ENV)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_MOCK_PAYMENTS;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const svc = new GatewayPaymentService();
    await expect(
      svc.verifyPayment({
        paymentId: 'pay_sandbox_order_123_1',
        expectedAmountPaise: 10000,
        expectedOrderId: 'order_123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects mock payments in production without ALLOW_MOCK_PAYMENTS', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_MOCK_PAYMENTS;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const svc = new GatewayPaymentService();
    await expect(
      svc.verifyPayment({
        paymentId: 'pay_sandbox_order_123_1',
        expectedAmountPaise: 10000,
        expectedOrderId: 'order_123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts sandbox payment ids when mock is allowed and order matches', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MOCK_PAYMENTS = 'true';
    const svc = new GatewayPaymentService();
    const verified = await svc.verifyPayment({
      paymentId: 'pay_sandbox_order_abc_999',
      expectedAmountPaise: 50000,
      expectedOrderId: 'order_abc',
      expectedDemandId: 'd1',
      expectedStudentUserId: 'u1',
    });
    expect(verified.mock).toBe(true);
    expect(verified.payment_id).toContain('pay_sandbox_');
    expect(verified.amount_paise).toBe(50000);
  });

  it('rejects sandbox payment that does not match order id', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MOCK_PAYMENTS = 'true';
    const svc = new GatewayPaymentService();
    await expect(
      svc.verifyPayment({
        paymentId: 'pay_sandbox_other_order_1',
        expectedAmountPaise: 1000,
        expectedOrderId: 'order_expected',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('createOrder requires gateway credentials in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_MOCK_PAYMENTS;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const svc = new GatewayPaymentService();
    await expect(
      svc.createOrder({
        amountInr: 100,
        receipt: 'fee_test',
        notes: { demand_id: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createOrder returns mock order when ALLOW_MOCK_PAYMENTS=true without keys', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MOCK_PAYMENTS = 'true';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const svc = new GatewayPaymentService();
    const order = await svc.createOrder({
      amountInr: 250,
      receipt: 'fee_test',
      notes: { demand_id: 'x' },
    });
    expect(order.mock).toBe(true);
    expect(order.amount_paise).toBe(25000);
    expect(order.razorpay_key).toBe('sandbox_falcon');
  });

  it.each(['NODE_ENV', 'DATABASE_ENV', 'DEPLOYMENT_ENV'])(
    'never enables mock settlement when %s marks production',
    async (marker) => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_MOCK_PAYMENTS = 'true';
      process.env[marker] = 'production';
      await expect(
        new GatewayPaymentService().verifyPayment({
          paymentId: 'pay_mock_synthetic',
          expectedAmountPaise: 10000,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  const payment = {
    id: 'pay_unit_real_123',
    order_id: 'order_unit_123',
    amount: 10000,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    notes: {
      demand_id: 'demand',
      student_user_id: 'student',
      tenant_id: 'tenant',
    },
  };
  const expected = {
    paymentId: payment.id,
    expectedAmountPaise: 10000,
    expectedOrderId: payment.order_id,
    expectedDemandId: 'demand',
    expectedStudentUserId: 'student',
    expectedTenantId: 'tenant',
  };
  function liveFixture(overrides: object = {}, orderOverrides: object = {}) {
    process.env.NODE_ENV = 'production';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_unit_key';
    process.env.RAZORPAY_KEY_SECRET = 'unit-secret-never-sent';
    Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: jest.fn((url: RequestInfo | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            (typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url
            ).includes('/v1/orders/')
              ? {
                  id: payment.order_id,
                  amount: 10000,
                  currency: 'INR',
                  notes: payment.notes,
                  ...orderOverrides,
                }
              : { ...payment, ...overrides },
          ),
      } as Response),
    ) });
    return new GatewayPaymentService();
  }
  it('accepts only a captured matching INR payment from the server response', async () => {
    await expect(liveFixture().verifyPayment(expected)).resolves.toEqual(
      expect.objectContaining({
        payment_id: payment.id,
        amount_paise: 10000,
        status: 'captured',
        mock: false,
      }),
    );
  });
  it.each([
    ['authorization without capture', { status: 'authorized' }],
    ['wrong currency', { currency: 'USD' }],
    ['missing currency', { currency: undefined }],
    ['one-paise shortfall', { amount: 9999 }],
    ['one-paise excess', { amount: 10001 }],
    ['fractional amount', { amount: 10000.1 }],
    ['wrong payment', { id: 'pay_someone_else' }],
    ['missing order', { order_id: undefined }],
    ['wrong order', { order_id: 'order_someone_else' }],
    ['wrong tenant', { notes: { ...payment.notes, tenant_id: 'foreign' } }],
  ])('rejects %s before financial settlement', async (_label, overrides) => {
    await expect(
      liveFixture(overrides).verifyPayment(expected),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects a gateway order response that changes the expected amount/currency', async () => {
    const svc = liveFixture({ id: 'order_unit_123', amount: 9999 });
    await expect(
      svc.createOrder({ amountInr: 100, receipt: 'synthetic', notes: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('uses verified server-order ownership when checkout omits payment notes', async () => {
    await expect(
      liveFixture({ notes: {} }).verifyPayment(expected),
    ).resolves.toEqual(expect.objectContaining({ status: 'captured' }));
    expect(jest.mocked(fetch).mock.calls[1]?.[0]).toBe(
      'https://api.razorpay.com/v1/orders/order_unit_123',
    );
  });
  it.each([
    ['missing order notes', { notes: {} }],
    ['foreign demand', { notes: { ...payment.notes, demand_id: 'foreign' } }],
    [
      'foreign student',
      { notes: { ...payment.notes, student_user_id: 'foreign' } },
    ],
    ['foreign tenant', { notes: { ...payment.notes, tenant_id: 'foreign' } }],
    ['wrong order identity', { id: 'order_foreign' }],
    ['wrong order currency', { currency: 'USD' }],
    ['wrong order amount', { amount: 9999 }],
  ])(
    'rejects %s even when captured payment matches the supplied order',
    async (_label, orderOverrides) => {
      await expect(
        liveFixture({ notes: {} }, orderOverrides).verifyPayment(expected),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GatewayPaymentService } from './gateway-payment.service';

describe('GatewayPaymentService', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
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
});

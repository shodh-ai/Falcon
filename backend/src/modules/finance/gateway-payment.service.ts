import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type GatewayOrderResult = {
  order_id: string;
  amount_paise: number;
  currency: 'INR';
  razorpay_key: string;
  mock: boolean;
};

export type VerifiedGatewayPayment = {
  payment_id: string;
  order_id: string | null;
  amount_paise: number;
  status: string;
  method: string | null;
  notes: Record<string, string>;
  mock: boolean;
};

/**
 * Server-side Razorpay order creation + payment verification.
 * Never trusts the client alone to mark a fee as paid.
 */
@Injectable()
export class GatewayPaymentService {
  private readonly logger = new Logger(GatewayPaymentService.name);

  /**
   * Mock / sandbox settle is opt-in only.
   * Set ALLOW_MOCK_PAYMENTS=true for local smoke / staging without Razorpay.
   * Never enable in internet-facing production.
   */
  mockPaymentsAllowed(): boolean {
    return process.env.ALLOW_MOCK_PAYMENTS === 'true';
  }

  private credentials(): { keyId: string; keySecret: string } | null {
    const keyId = (process.env.RAZORPAY_KEY_ID ?? '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET ?? '').trim();
    if (!keyId || !keySecret) return null;
    // Reject known placeholder / sandbox fake keys for live verification
    if (
      keyId === 'rzp_test_FALCON_CAMPUS' ||
      keyId.startsWith('sandbox_')
    ) {
      return null;
    }
    return { keyId, keySecret };
  }

  private basicAuthHeader(keyId: string, keySecret: string): string {
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  }

  isMockPaymentId(paymentId: string): boolean {
    const id = paymentId.trim();
    return (
      id.startsWith('pay_sandbox_') ||
      id.startsWith('MOCK-') ||
      id.startsWith('pay_mock_') ||
      /^pay_\d+$/.test(id)
    );
  }

  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const creds = this.credentials();
    if (!creds) return false;
    const expected = createHmac('sha256', creds.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature.trim(), 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async createOrder(input: {
    amountInr: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrderResult> {
    const amountPaise = Math.round(Number(input.amountInr) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      throw new BadRequestException('Invalid payment amount');
    }

    const creds = this.credentials();
    if (!creds) {
      if (!this.mockPaymentsAllowed()) {
        throw new BadRequestException(
          'Payment gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
        );
      }
      const orderId = `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        order_id: orderId,
        amount_paise: amountPaise,
        currency: 'INR',
        razorpay_key: 'sandbox_falcon',
        mock: true,
      };
    }

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: this.basicAuthHeader(creds.keyId, creds.keySecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
        payment_capture: 1,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Razorpay order create failed: ${res.status} ${body}`);
      throw new BadRequestException(
        'Could not create payment order with the gateway',
      );
    }

    const data = (await res.json()) as { id?: string; amount?: number };
    if (!data.id) {
      throw new BadRequestException('Gateway did not return an order id');
    }

    return {
      order_id: data.id,
      amount_paise: Number(data.amount ?? amountPaise),
      currency: 'INR',
      razorpay_key: creds.keyId,
      mock: false,
    };
  }

  /**
   * Verifies a payment id against Razorpay (or allows gated mock payments).
   * amountPaiseExpected must match the captured amount.
   */
  async verifyPayment(input: {
    paymentId: string;
    expectedAmountPaise: number;
    expectedOrderId?: string | null;
    expectedDemandId?: string | null;
    expectedStudentUserId?: string | null;
    signature?: string | null;
  }): Promise<VerifiedGatewayPayment> {
    const paymentId = (input.paymentId ?? '').trim();
    if (!paymentId || paymentId.length < 8 || paymentId.length > 120) {
      throw new BadRequestException('Invalid payment id');
    }

    if (this.isMockPaymentId(paymentId)) {
      if (!this.mockPaymentsAllowed()) {
        throw new UnauthorizedException(
          'Mock payment references are not accepted in production',
        );
      }
      if (
        input.expectedOrderId &&
        paymentId.startsWith('pay_sandbox_') &&
        !paymentId.includes(input.expectedOrderId)
      ) {
        throw new UnauthorizedException(
          'Sandbox payment does not match the checkout order',
        );
      }
      return {
        payment_id: paymentId,
        order_id: input.expectedOrderId ?? null,
        amount_paise: input.expectedAmountPaise,
        status: 'captured',
        method: 'UPI',
        notes: {
          demand_id: input.expectedDemandId ?? '',
          student_user_id: input.expectedStudentUserId ?? '',
        },
        mock: true,
      };
    }

    const creds = this.credentials();
    if (!creds) {
      throw new BadRequestException(
        'Payment gateway is not configured for verification',
      );
    }

    if (
      input.signature &&
      input.expectedOrderId &&
      !this.verifyCheckoutSignature(
        input.expectedOrderId,
        paymentId,
        input.signature,
      )
    ) {
      throw new UnauthorizedException('Invalid payment signature');
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: this.basicAuthHeader(creds.keyId, creds.keySecret),
        },
      },
    );

    if (res.status === 404) {
      throw new UnauthorizedException('Payment not found at gateway');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Razorpay payment fetch failed: ${res.status} ${body}`);
      throw new BadRequestException('Could not verify payment with gateway');
    }

    const payment = (await res.json()) as {
      id?: string;
      order_id?: string;
      amount?: number;
      status?: string;
      method?: string;
      notes?: Record<string, string>;
    };

    const status = String(payment.status ?? '').toLowerCase();
    if (!['captured', 'authorized'].includes(status)) {
      throw new UnauthorizedException(
        `Payment is not successful (status=${status || 'unknown'})`,
      );
    }

    const amountPaise = Number(payment.amount ?? 0);
    if (
      !Number.isFinite(amountPaise) ||
      Math.abs(amountPaise - input.expectedAmountPaise) > 1
    ) {
      throw new UnauthorizedException(
        'Payment amount does not match the fee demand',
      );
    }

    if (
      input.expectedOrderId &&
      payment.order_id &&
      payment.order_id !== input.expectedOrderId
    ) {
      throw new UnauthorizedException('Payment order mismatch');
    }

    const notes = payment.notes ?? {};
    if (
      input.expectedDemandId &&
      notes.demand_id &&
      notes.demand_id !== input.expectedDemandId
    ) {
      throw new UnauthorizedException('Payment demand mismatch');
    }
    if (
      input.expectedStudentUserId &&
      notes.student_user_id &&
      notes.student_user_id !== input.expectedStudentUserId
    ) {
      throw new UnauthorizedException('Payment student mismatch');
    }

    return {
      payment_id: String(payment.id ?? paymentId),
      order_id: payment.order_id ?? input.expectedOrderId ?? null,
      amount_paise: amountPaise,
      status,
      method: payment.method ? String(payment.method).toUpperCase() : null,
      notes,
      mock: false,
    };
  }
}

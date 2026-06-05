import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HostelTatkalService } from './hostel-tatkal.service';

type DemandPaidPayload = {
  demandId?: string;
  feeHead?: string;
  studentUserId?: string;
  tenantId?: string;
  holdId?: string;
  paymentId?: string;
};

@Injectable()
export class HostelTatkalPaymentListener {
  private readonly logger = new Logger(HostelTatkalPaymentListener.name);

  constructor(private readonly tatkal: HostelTatkalService) {}

  @OnEvent('hostel.booking.payment_captured')
  async onHostelPayment(payload: DemandPaidPayload) {
    if (!payload.holdId || !payload.studentUserId) {
      return;
    }
    try {
      await this.tatkal.finalizeFromWebhook(
        payload.tenantId ?? 'a0000000-0000-4000-8000-000000000001',
        payload.studentUserId,
        payload.holdId,
        payload.paymentId ?? `webhook_${Date.now()}`,
      );
    } catch (e) {
      this.logger.warn(`Hostel booking finalize skipped: ${e instanceof Error ? e.message : e}`);
    }
  }
}

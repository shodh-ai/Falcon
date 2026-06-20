import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CampusEventsService } from './campus-events.service';

type EventPaidPayload = {
  tenantId?: string;
  studentUserId?: string;
  registrationId?: string;
  paymentId?: string;
};

@Injectable()
export class CampusEventsPaymentListener {
  private readonly logger = new Logger(CampusEventsPaymentListener.name);

  constructor(private readonly campusEvents: CampusEventsService) {}

  @OnEvent('event.registration.paid')
  async onEventPayment(payload: EventPaidPayload) {
    if (!payload.registrationId || !payload.studentUserId) return;
    try {
      await this.campusEvents.finalizeFromWebhook(
        payload.tenantId ?? 'a0000000-0000-4000-8000-000000000001',
        payload.studentUserId,
        payload.registrationId,
        payload.paymentId ?? `webhook_${Date.now()}`,
      );
    } catch (e) {
      this.logger.warn(
        `Event registration finalize skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

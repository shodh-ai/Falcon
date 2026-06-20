import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CertificateAutomationService } from './certificate-automation.service';

@Injectable()
export class CertificateAutomationFinanceListener {
  private readonly logger = new Logger(
    CertificateAutomationFinanceListener.name,
  );

  constructor(private readonly certs: CertificateAutomationService) {}

  @OnEvent('finance.demand_paid')
  async onDemandPaid(payload: {
    demandId: string;
    feeHead?: string;
    transactionId?: string;
  }) {
    if (payload.feeHead !== 'DEGREE_CERTIFICATE') return;

    const result = await this.certs.onFeePaid(payload.demandId);
    if (result) {
      this.logger.log(
        `Certificate application unlocked for demand ${payload.demandId}`,
      );
    }
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  LEADERSHIP_ANOMALY_QUEUE,
  LeadershipAnomalyJob,
} from '../../common/constants/leadership-queue.constants';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Processor(LEADERSHIP_ANOMALY_QUEUE)
export class AnomalyDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(AnomalyDetectionProcessor.name);

  constructor(private readonly anomaly: AnomalyDetectionService) {
    super();
  }

  async process(job: Job<LeadershipAnomalyJob>) {
    const data = job.data;
    this.logger.debug(`Processing anomaly job ${data.type}`);

    if (data.type === 'invoice_created') {
      await this.anomaly.processInvoice(data.tenantId, data.invoiceId);
    } else if (data.type === 'budget_check') {
      await this.anomaly.checkBudgetThresholds(
        data.tenantId,
        data.departmentId,
      );
    }
    return { ok: true };
  }
}

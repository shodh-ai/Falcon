import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FINANCE_BULK_DEMAND_QUEUE,
  FinanceBulkDemandJob,
} from '../../common/constants/finance-queue.constants';
import { FinanceAccountsService } from './finance-accounts.service';

@Processor(FINANCE_BULK_DEMAND_QUEUE)
export class FinanceBulkDemandProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceBulkDemandProcessor.name);

  constructor(private readonly accounts: FinanceAccountsService) {
    super();
  }

  async process(job: Job<FinanceBulkDemandJob>) {
    this.logger.log(`Bulk demand job ${job.data.jobId} started`);
    try {
      const result = await this.accounts.runBulkDemandGeneration(job.data.tenantId, job.data.jobId, job.data);
      return result;
    } catch (err) {
      this.logger.error(`Bulk demand job failed: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FINANCE_BULK_DEMAND_QUEUE,
  FinanceBulkDemandJob,
} from '../../common/constants/finance-queue.constants';
import { FinanceAccountsService } from './finance-accounts.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';

@Processor(FINANCE_BULK_DEMAND_QUEUE)
export class FinanceBulkDemandProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceBulkDemandProcessor.name);

  constructor(
    private readonly accounts: FinanceAccountsService,
    @Optional() private readonly notifications?: FalconNotificationsService,
  ) {
    super();
  }

  async process(job: Job<FinanceBulkDemandJob>) {
    this.logger.log(`Bulk demand job ${job.data.jobId} started`);
    try {
      const result = await this.accounts.runBulkDemandGeneration(
        job.data.tenantId,
        job.data.jobId,
        job.data,
      );
      await this.notifyRequester(job, 'Fee demand generation completed',
        `${result.generated} new demand(s) were created.`, '/finance/fee-demands');
      return result;
    } catch (err) {
      await this.accounts.markBulkJobFailed(job.data.tenantId, job.data.jobId, err);
      await this.notifyRequester(job, 'Fee demand generation needs attention',
        'Generation stopped. Review existing demands before retrying.', '/finance/fee-structures');
      this.logger.error(
        `Bulk demand job failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async notifyRequester(job: Job<FinanceBulkDemandJob>, title: string, message: string, actionLink: string) {
    if (!job.data.requestedBy || !this.notifications) return;
    try {
      await this.notifications.create({
        tenantId: job.data.tenantId,
        userId: job.data.requestedBy,
        category: 'FINANCE',
        title,
        message,
        actionLink,
        intent: 'status_update',
      });
    } catch (error) {
      this.logger.warn(`Could not notify fee-demand requester: ${String(error)}`);
    }
  }
}

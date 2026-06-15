import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  HR_PAYROLL_QUEUE,
  type HrPayrollJob,
} from '../../common/constants/hr-payroll-queue.constants';
import { HrService } from './hr.service';

@Processor(HR_PAYROLL_QUEUE)
export class HrPayrollProcessor extends WorkerHost {
  private readonly logger = new Logger(HrPayrollProcessor.name);

  constructor(private readonly hr: HrService) {
    super();
  }

  async process(job: Job<HrPayrollJob>) {
    this.logger.log(`Payroll job ${job.data.jobId} started for ${job.data.monthKey}`);
    try {
      return await this.hr.runPayroll(job.data.tenantId, job.data.monthKey);
    } catch (err) {
      this.logger.error(`Payroll job failed: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }
}

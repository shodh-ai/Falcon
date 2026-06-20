import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CERTIFICATE_AUTOMATION_QUEUE,
  type CertificateGenerationJob,
} from '../../common/constants/certificate-automation-queue.constants';
import { CertificateAutomationService } from './certificate-automation.service';

@Processor(CERTIFICATE_AUTOMATION_QUEUE)
export class CertificateAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(CertificateAutomationProcessor.name);

  constructor(private readonly certs: CertificateAutomationService) {
    super();
  }

  async process(job: Job<CertificateGenerationJob>) {
    this.logger.log(`Certificate batch job ${job.data.jobId} started`);
    try {
      return await this.certs.runBatchGeneration(job.data);
    } catch (err) {
      this.logger.error(
        `Certificate batch job failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}

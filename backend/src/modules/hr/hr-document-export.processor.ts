import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  HR_DOCUMENT_EXPORT_QUEUE,
  type HrDocumentExportJob,
} from '../../common/constants/hr-export-queue.constants';
import { HrDocumentExportService } from './hr-document-export.service';

@Processor(HR_DOCUMENT_EXPORT_QUEUE)
export class HrDocumentExportProcessor extends WorkerHost {
  private readonly logger = new Logger(HrDocumentExportProcessor.name);

  constructor(private readonly exportService: HrDocumentExportService) {
    super();
  }

  async process(job: Job<HrDocumentExportJob>) {
    this.logger.log(`Document export job ${job.data.jobId} started`);
    try {
      return await this.exportService.runExport(job.data);
    } catch (err) {
      this.logger.error(
        `Document export job failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}

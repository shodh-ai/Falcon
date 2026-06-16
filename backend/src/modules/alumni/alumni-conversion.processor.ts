import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  ALUMNI_CONVERSION_QUEUE,
  AlumniConversionJob,
} from '../../common/constants/alumni-queue.constants';
import { AlumniConversionService } from './alumni-conversion.service';

@Processor(ALUMNI_CONVERSION_QUEUE)
export class AlumniConversionProcessor extends WorkerHost {
  private readonly logger = new Logger(AlumniConversionProcessor.name);

  constructor(private readonly conversion: AlumniConversionService) {
    super();
  }

  async process(job: Job<AlumniConversionJob>) {
    this.logger.log(`Processing alumni conversion job for ${job.data.studentUserId}`);
    return this.conversion.runConversion(job.data);
  }
}

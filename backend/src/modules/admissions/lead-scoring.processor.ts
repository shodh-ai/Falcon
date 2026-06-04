import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LEAD_SCORING_QUEUE, LeadScoreJob, LeadScoringService } from './lead-scoring.service';

@Processor(LEAD_SCORING_QUEUE)
export class LeadScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadScoringProcessor.name);

  constructor(private readonly scoring: LeadScoringService) {
    super();
  }

  async process(job: Job<LeadScoreJob>) {
    if (job.data.leadId) {
      return this.scoring.scoreLead(job.data.leadId);
    }
    return this.scoring.scoreAllForTenant(job.data.tenantId);
  }
}

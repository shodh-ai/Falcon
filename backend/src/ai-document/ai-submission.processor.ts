import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { GeminiService } from './gemini.service';
import { SUBMISSION_AI_QUEUE } from '../common/constants/ai-queue.constants';
import { AiSubmissionStatus } from '../common/enums/ai-submission-status.enum';

function firstPdfAbsolutePath(filePath: string | undefined, fileType: string | undefined): string | null {
  if (!filePath) return null;
  const paths = filePath.split(',').map((s) => s.trim()).filter(Boolean);
  const types = (fileType || '').split(',').map((s) => s.trim());
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const t = (types[i] || '').toLowerCase();
    if (t.includes('pdf') || p.toLowerCase().endsWith('.pdf')) {
      return p;
    }
  }
  return null;
}

@Processor(SUBMISSION_AI_QUEUE)
export class AiSubmissionProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSubmissionProcessor.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly gemini: GeminiService,
  ) {
    super();
  }

  async process(job: Job<{ submissionId: string }>): Promise<void> {
    const { submissionId } = job.data;
    const submission = await this.submissionRepo.findOne({
      where: { submission_id: submissionId },
      relations: ['assignment', 'assignment.task'],
    });

    if (!submission) {
      this.logger.warn(`Submission ${submissionId} not found; skipping.`);
      return;
    }

    const pdfPath = firstPdfAbsolutePath(submission.file_path, submission.file_type);
    if (!pdfPath) {
      submission.ai_status = AiSubmissionStatus.REJECTED_MISMATCH;
      submission.ai_extracted_data = {};
      submission.ai_remarks = 'No PDF attachment found for AI validation.';
      await this.submissionRepo.save(submission);
      return;
    }

    const taskName = submission.assignment?.task?.task_name || 'Unknown task';

    try {
      const result = await this.gemini.analyzePdfForTask({
        absolutePdfPath: pdfPath,
        taskName,
      });

      submission.ai_status = result.status;
      submission.ai_extracted_data = result.extracted_data;
      submission.ai_remarks = result.remarks;
      await this.submissionRepo.save(submission);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI job failed for ${submissionId}: ${msg}`);
      submission.ai_status = AiSubmissionStatus.REJECTED_MISMATCH;
      submission.ai_extracted_data = {};
      submission.ai_remarks = `AI processing error: ${msg.slice(0, 2000)}`;
      await this.submissionRepo.save(submission);
    }
  }
}

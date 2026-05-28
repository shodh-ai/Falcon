import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { TaskMaster } from '../entities/task-master.entity';
import { SUBMISSION_AI_QUEUE } from '../common/constants/ai-queue.constants';
import { AiSubmissionProcessor } from './ai-submission.processor';
import { GeminiService } from './gemini.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: SUBMISSION_AI_QUEUE }),
    TypeOrmModule.forFeature([Submission, TaskAssignment, TaskMaster]),
  ],
  providers: [AiSubmissionProcessor, GeminiService],
  exports: [BullModule],
})
export class AiDocumentModule {}

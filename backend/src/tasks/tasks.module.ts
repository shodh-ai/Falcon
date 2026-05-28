import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskMaster } from '../entities/task-master.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { AiDocumentModule } from '../ai-document/ai-document.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskMaster, TaskAssignment, Submission, User]),
    AiDocumentModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

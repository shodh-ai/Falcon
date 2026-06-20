import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { TaskMaster } from '../entities/task-master.entity';
import { User } from '../entities/user.entity';
import { OwnerDailyBrief } from '../entities/owner-daily-brief.entity';
import { TasksModule } from '../tasks/tasks.module';
import { LeadershipModule } from '../modules/leadership/leadership.module';
import { LeadershipAiModule } from '../modules/leadership-ai/leadership-ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskAssignment,
      TaskMaster,
      User,
      OwnerDailyBrief,
    ]),
    TasksModule,
    forwardRef(() => LeadershipModule),
    LeadershipAiModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}

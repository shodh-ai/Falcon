import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { TaskMaster } from '../entities/task-master.entity';
import { User } from '../entities/user.entity';
import { TasksModule } from '../tasks/tasks.module';
import { LeadershipModule } from '../modules/leadership/leadership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskAssignment, TaskMaster, User]),
    TasksModule,
    forwardRef(() => LeadershipModule),
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}

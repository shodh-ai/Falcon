import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';
import { HandoverLog } from '../entities/handover-log.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HandoverLog, TaskAssignment, User]),
  ],
  controllers: [HandoverController],
  providers: [HandoverService],
})
export class HandoverModule {}

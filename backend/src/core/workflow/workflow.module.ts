import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { User } from '../../entities/user.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { HostelRoom } from '../../entities/hostel-room.entity';
import { Role } from '../../entities/role.entity';
import { WorkflowRoutingService } from './workflow-routing.service';
import { WorkflowNotificationService } from './workflow-notification.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicMentorship,
      User,
      HostelAllocation,
      HostelRoom,
      Role,
    ]),
  ],
  providers: [WorkflowRoutingService, WorkflowNotificationService],
  exports: [WorkflowRoutingService, WorkflowNotificationService],
})
export class WorkflowModule {}

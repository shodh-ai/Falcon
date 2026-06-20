import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { StudentSafetyController } from './student-safety.controller';
import { StudentSafetyService } from './student-safety.service';

@Module({
  imports: [NotificationsModule],
  controllers: [StudentSafetyController],
  providers: [StudentSafetyService],
})
export class StudentSafetyModule {}

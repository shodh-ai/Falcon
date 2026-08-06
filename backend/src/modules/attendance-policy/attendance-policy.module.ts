import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { AttendancePolicyController } from './attendance-policy.controller';
import { AttendancePolicyService } from './attendance-policy.service';
import { AttendanceEligibilityService } from './attendance-eligibility.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AttendancePolicyController],
  providers: [AttendancePolicyService, AttendanceEligibilityService],
  exports: [AttendanceEligibilityService, AttendancePolicyService],
})
export class AttendancePolicyModule {}

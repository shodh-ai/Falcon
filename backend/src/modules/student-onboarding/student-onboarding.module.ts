import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import {
  StudentOnboardingController,
  StudentVerificationAdminController,
} from './student-onboarding.controller';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentOnboardingWelcomeEmailListener } from './student-onboarding-welcome-email.listener';

@Module({
  imports: [StorageModule],
  controllers: [StudentOnboardingController, StudentVerificationAdminController],
  providers: [StudentOnboardingService, StudentOnboardingWelcomeEmailListener],
  exports: [StudentOnboardingService],
})
export class StudentOnboardingModule {}

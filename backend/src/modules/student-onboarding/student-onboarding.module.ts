import { Module } from '@nestjs/common';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { StorageModule } from '../../storage/storage.module';
import {
  StudentOnboardingController,
  StaffOnboardingController,
  StudentVerificationAdminController,
} from './student-onboarding.controller';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentOnboardingWelcomeEmailListener } from './student-onboarding-welcome-email.listener';

@Module({
  imports: [StorageModule],
  controllers: [
    StudentOnboardingController,
    StaffOnboardingController,
    StudentVerificationAdminController,
  ],
  providers: [
    StudentOnboardingService,
    StudentOnboardingWelcomeEmailListener,
    HrFieldEncryptionService,
  ],
  exports: [StudentOnboardingService],
})
export class StudentOnboardingModule {}

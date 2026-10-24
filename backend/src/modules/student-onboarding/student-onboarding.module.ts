import { Module } from '@nestjs/common';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { StorageModule } from '../../storage/storage.module';
import { ExamCellModule } from '../exam-cell/exam-cell.module';
import {
  StudentOnboardingController,
  StaffOnboardingController,
  StaffVerificationController,
  StudentVerificationAdminController,
} from './student-onboarding.controller';
import { RegistrarIntegrationController } from './registrar-integration.controller';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentOnboardingWelcomeEmailListener } from './student-onboarding-welcome-email.listener';
import { StaffProfileReviewService } from './staff-profile-review.service';
import { StaffProfileReviewNotificationService } from './staff-profile-review-notification.service';
import { StaffProfileReviewAdminController, StaffProfileReviewSelfController } from './staff-profile-review.controller';

@Module({
  imports: [StorageModule, ExamCellModule],
  controllers: [
    StudentOnboardingController,
    StaffOnboardingController,
    StaffVerificationController,
    StudentVerificationAdminController,
    RegistrarIntegrationController,
    StaffProfileReviewAdminController,
    StaffProfileReviewSelfController,
  ],
  providers: [
    StudentOnboardingService,
    StudentOnboardingWelcomeEmailListener,
    HrFieldEncryptionService,
    StaffProfileReviewService,
    StaffProfileReviewNotificationService,
  ],
  exports: [StudentOnboardingService],
})
export class StudentOnboardingModule {}

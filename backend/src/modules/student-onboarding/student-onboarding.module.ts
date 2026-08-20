import { Module } from '@nestjs/common';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { StorageModule } from '../../storage/storage.module';
import { ExamCellModule } from '../exam-cell/exam-cell.module';
import {
  StudentOnboardingController,
  StaffOnboardingController,
  StudentVerificationAdminController,
} from './student-onboarding.controller';
import { RegistrarIntegrationController } from './registrar-integration.controller';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentOnboardingWelcomeEmailListener } from './student-onboarding-welcome-email.listener';

@Module({
  imports: [StorageModule, ExamCellModule],
  controllers: [
    StudentOnboardingController,
    StaffOnboardingController,
    StudentVerificationAdminController,
    RegistrarIntegrationController,
  ],
  providers: [
    StudentOnboardingService,
    StudentOnboardingWelcomeEmailListener,
    HrFieldEncryptionService,
  ],
  exports: [StudentOnboardingService],
})
export class StudentOnboardingModule {}

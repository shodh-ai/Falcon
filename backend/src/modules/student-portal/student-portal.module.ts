import { Module } from '@nestjs/common';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { AlumniModule } from '../alumni/alumni.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { FinanceModule } from '../finance/finance.module';
import { AcademicsModule } from '../academics/academics.module';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';

@Module({
  imports: [AlumniModule, HelpdeskModule, FinanceModule, AcademicsModule],
  controllers: [StudentPortalController],
  providers: [StudentPortalService, HrFieldEncryptionService],
})
export class StudentPortalModule {}

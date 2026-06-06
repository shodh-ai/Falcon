import { Module } from '@nestjs/common';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { AlumniModule } from '../alumni/alumni.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';

@Module({
  imports: [AlumniModule, HelpdeskModule],
  controllers: [StudentPortalController],
  providers: [StudentPortalService, HrFieldEncryptionService],
})
export class StudentPortalModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FinanceModule } from '../finance/finance.module';
import { AlumniModule } from '../alumni/alumni.module';
import { StorageModule } from '../../storage/storage.module';
import { CERTIFICATE_AUTOMATION_QUEUE } from '../../common/constants/certificate-automation-queue.constants';
import { CertificateAutomationController } from './certificate-automation.controller';
import { CertificateAutomationService } from './certificate-automation.service';
import { CertificateAutomationFinanceListener } from './certificate-automation-finance.listener';
import { CertificateAutomationProcessor } from './certificate-automation.processor';
import { DegreeCertificatePdfService } from './pdf/degree-certificate-pdf.service';

@Module({
  imports: [
    FinanceModule,
    AlumniModule,
    StorageModule,
    BullModule.registerQueue({ name: CERTIFICATE_AUTOMATION_QUEUE }),
  ],
  controllers: [CertificateAutomationController],
  providers: [
    CertificateAutomationService,
    CertificateAutomationFinanceListener,
    CertificateAutomationProcessor,
    DegreeCertificatePdfService,
  ],
  exports: [CertificateAutomationService],
})
export class CertificateAutomationModule {}

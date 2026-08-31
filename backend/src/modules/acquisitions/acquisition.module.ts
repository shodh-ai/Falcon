import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DofaEngineModule } from '../dofa-engine/dofa-engine.module';
import { AcquisitionController } from './acquisition.controller';
import { AcquisitionImportService } from './acquisition-import.service';
import { AcquisitionService } from './acquisition.service';
import { AcquisitionIntegrationController } from './acquisition-integration.controller';
import { AcquisitionIntegrationService } from './acquisition-integration.service';
import { AcquisitionOutboxPublisher } from './acquisition-outbox.publisher';
import { IrmsServiceAuthGuard } from './irms-service-auth.guard';
import { AcquisitionExpiryService } from './acquisition-expiry.service';

@Module({
  imports: [DofaEngineModule, JwtModule.register({})],
  controllers: [AcquisitionController, AcquisitionIntegrationController],
  providers: [
    AcquisitionService,
    AcquisitionImportService,
    AcquisitionIntegrationService,
    AcquisitionOutboxPublisher,
    IrmsServiceAuthGuard,
    AcquisitionExpiryService,
  ],
  exports: [AcquisitionService],
})
export class AcquisitionModule {}

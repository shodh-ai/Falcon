import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALUMNI_CONVERSION_QUEUE } from '../../common/constants/alumni-queue.constants';
import { AlumniProfile } from '../../entities/alumni-profile.entity';
import { AlumniDonation } from '../../entities/alumni-donation.entity';
import { AlumniEvent } from '../../entities/alumni-event.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';
import { AlumniController } from './alumni.controller';
import { AlumniAdminController } from './alumni-admin.controller';
import { AlumniPortalService } from './alumni-portal.service';
import { AlumniAdminService } from './alumni-admin.service';
import { AlumniConversionService } from './alumni-conversion.service';
import { AlumniConversionProcessor } from './alumni-conversion.processor';
import { AlumniWelcomeEmailListener } from './alumni-welcome-email.listener';

@Module({
  imports: [
    BullModule.registerQueue({ name: ALUMNI_CONVERSION_QUEUE }),
    TypeOrmModule.forFeature([
      AlumniProfile,
      AlumniDonation,
      AlumniEvent,
      AlumniServiceRequest,
    ]),
  ],
  controllers: [AlumniController, AlumniAdminController],
  providers: [
    AlumniPortalService,
    AlumniAdminService,
    AlumniConversionService,
    AlumniConversionProcessor,
    AlumniWelcomeEmailListener,
  ],
  exports: [AlumniConversionService, AlumniPortalService, AlumniAdminService],
})
export class AlumniModule {}

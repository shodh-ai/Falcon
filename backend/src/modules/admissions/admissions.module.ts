import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../../entities/lead.entity';
import { Application } from '../../entities/application.entity';
import { DocumentVerification } from '../../entities/document-verification.entity';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsCrmController } from './admissions-crm.controller';
import { AdmissionsService } from './admissions.service';
import { LeadScoringService, LEAD_SCORING_QUEUE } from './lead-scoring.service';
import { LeadScoringProcessor } from './lead-scoring.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: LEAD_SCORING_QUEUE }),
    TypeOrmModule.forFeature([Lead, Application, DocumentVerification]),
  ],
  controllers: [AdmissionsController, AdmissionsCrmController],
  providers: [AdmissionsService, LeadScoringService, LeadScoringProcessor],
  exports: [AdmissionsService, LeadScoringService],
})
export class AdmissionsModule {}

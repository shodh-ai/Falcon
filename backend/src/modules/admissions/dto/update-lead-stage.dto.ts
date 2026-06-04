import { IsIn } from 'class-validator';
import type { LeadStage } from '../../../entities/lead.entity';

export class UpdateLeadStageDto {
  @IsIn([
    'INQUIRY',
    'RAW_LEAD',
    'CONTACTED',
    'APPLICATION_STARTED',
    'FEE_PAID',
    'DOCUMENT_VERIFICATION',
    'APPLICATION_SUBMITTED',
    'OFFERED',
    'ENROLLED',
    'LOST',
  ])
  stage: LeadStage;
}

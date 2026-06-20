import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { HelpdeskTicketStatus } from '../../../entities/helpdesk-ticket.entity';

export class UpdateTicketStatusDto {
  @IsIn(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'])
  status: HelpdeskTicketStatus;

  @ValidateIf((o) => o.status === 'REJECTED')
  @IsString()
  @MinLength(10, { message: 'rejection_reason must be at least 10 characters' })
  rejection_reason?: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;
}

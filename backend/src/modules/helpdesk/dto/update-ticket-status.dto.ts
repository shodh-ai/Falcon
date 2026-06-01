import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { HelpdeskTicketStatus } from '../../../entities/helpdesk-ticket.entity';

export class UpdateTicketStatusDto {
  @IsIn(['PENDING', 'IN_PROGRESS', 'RESOLVED'])
  status: HelpdeskTicketStatus;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;
}

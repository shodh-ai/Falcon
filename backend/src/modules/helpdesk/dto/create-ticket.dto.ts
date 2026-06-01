import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { HelpdeskTicketCategory } from '../../../entities/helpdesk-ticket.entity';

export class CreateTicketDto {
  @IsIn(['FINANCE', 'ACADEMICS', 'IT', 'HOSTEL', 'MENTORSHIP'])
  category: HelpdeskTicketCategory;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  description: string;
}

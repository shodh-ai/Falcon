import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { HelpdeskTicketCategory } from '../../../entities/helpdesk-ticket.entity';

export class CreateTicketDto {
  @IsIn([
    'FINANCE',
    'ACADEMICS',
    'IT',
    'HOSTEL',
    'HR',
    'FACILITIES',
    'MENTORSHIP',
    'STUDENT_PROFILE',
  ])
  category: HelpdeskTicketCategory;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  description: string;

  /** When set (e.g. mentorship portal), route directly to this faculty user. */
  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;
}

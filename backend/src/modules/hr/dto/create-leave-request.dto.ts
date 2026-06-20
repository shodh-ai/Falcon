import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import type { LeaveType } from '../../../entities/leave-request.entity';

export class CreateLeaveRequestDto {
  @IsUUID()
  requester_user_id: string;

  @IsIn(['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'LWP', 'OTHER'])
  leave_type: LeaveType;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  total_days: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

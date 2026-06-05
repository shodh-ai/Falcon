import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHostelLeaveDto {
  @IsString()
  @MaxLength(40)
  leave_type: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @IsDateString()
  from_date: string;

  @IsDateString()
  to_date: string;
}

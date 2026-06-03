import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitMentorLeaveRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;
}

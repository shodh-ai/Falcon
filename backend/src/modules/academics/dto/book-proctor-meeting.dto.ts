import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BookProctorMeetingDto {
  @IsDateString()
  meeting_at: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

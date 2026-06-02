import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondMentorshipMeetingDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

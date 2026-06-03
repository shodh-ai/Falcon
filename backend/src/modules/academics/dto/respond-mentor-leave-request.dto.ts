import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RespondMentorLeaveRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AssignMentorDto {
  @IsUUID()
  student_user_id: string;

  @IsUUID()
  proctor_user_id: string;

  @IsOptional()
  @IsDateString()
  active_from?: string;

  @IsOptional()
  @IsDateString()
  active_till?: string;
}

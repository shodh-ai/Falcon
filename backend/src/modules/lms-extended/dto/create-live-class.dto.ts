import { IsDateString, IsOptional, IsString, IsUrl, IsUUID, MinLength } from 'class-validator';

export class CreateLiveClassDto {
  @IsUUID()
  course_id: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsUrl()
  meeting_url: string;

  @IsDateString()
  starts_at: string;

  @IsDateString()
  ends_at: string;

  @IsOptional()
  @IsString()
  description?: string;
}

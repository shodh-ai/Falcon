import { IsBoolean, IsDateString, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateJobPostingDto {
  @IsString()
  @MaxLength(200)
  company_name: string;

  @IsString()
  @MaxLength(200)
  role_title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ctc_lpa?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsObject()
  eligibility?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  one_student_one_job?: boolean;

  @IsOptional()
  @IsDateString()
  apply_deadline?: string;
}

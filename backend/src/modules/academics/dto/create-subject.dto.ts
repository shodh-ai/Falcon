import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MaxLength(30)
  subject_code: string;

  @IsString()
  @MaxLength(200)
  subject_name: string;

  @IsInt()
  program_id: number;

  @IsOptional()
  @IsInt()
  semester?: number;

  @IsOptional()
  @IsInt()
  credits?: number;

  @IsOptional()
  @IsString()
  subject_type?: string;
}

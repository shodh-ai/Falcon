import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MaxLength(150)
  program_name: string;

  @IsString()
  @MaxLength(20)
  program_code: string;

  @IsOptional()
  @IsInt()
  duration_years?: number;

  @IsOptional()
  @IsInt()
  school_id?: number;

  @IsOptional()
  @IsInt()
  dept_id?: number;
}

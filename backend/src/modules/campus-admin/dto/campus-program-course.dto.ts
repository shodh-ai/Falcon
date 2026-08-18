import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCampusProgramDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  program_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  program_code!: string;

  @Type(() => Number)
  @IsInt()
  school_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dept_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_years?: number | null;
}

export class UpdateCampusProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  program_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  program_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  school_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dept_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_years?: number | null;
}

export class CreateCampusCourseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  course_name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  course_code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  credits!: number;

  @Type(() => Number)
  @IsInt()
  dept_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semester?: number | null;

  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;
}

export class UpdateCampusCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  course_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  course_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  credits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dept_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semester?: number | null;

  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;
}

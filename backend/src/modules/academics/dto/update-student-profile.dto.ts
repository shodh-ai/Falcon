import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateStudentProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  enrollment_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  batch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  blood_group?: string;

  @IsOptional()
  @IsObject()
  parent_info?: Record<string, unknown>;
}

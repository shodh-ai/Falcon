import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MaxLength(150)
  school_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  school_code?: string;

  @IsOptional()
  @IsInt()
  campus_id?: number;
}

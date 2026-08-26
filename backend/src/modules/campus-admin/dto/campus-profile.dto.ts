import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCampusProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  campus_id?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  campus_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  campus_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;
}

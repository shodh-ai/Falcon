import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCampusDto {
  @IsString()
  @MaxLength(100)
  campus_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  campus_code?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

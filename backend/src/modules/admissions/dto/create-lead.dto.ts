import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MaxLength(200)
  full_name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsInt()
  preferred_program_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  stage?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

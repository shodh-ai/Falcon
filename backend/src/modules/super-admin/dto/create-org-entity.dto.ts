import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrgEntityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  entity_name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  entity_code: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tax_id?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

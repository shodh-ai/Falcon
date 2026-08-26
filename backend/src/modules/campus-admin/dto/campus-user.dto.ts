import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCampusUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(2)
  role_name!: string;

  @Type(() => Number)
  @IsInt()
  dept_id!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporary_password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateCampusUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  role_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dept_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

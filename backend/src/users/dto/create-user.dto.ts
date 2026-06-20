import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNumber()
  @IsOptional()
  role_id?: number;

  @IsNumber()
  @IsOptional()
  dept_id?: number;

  @IsString()
  @IsOptional()
  google_id?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

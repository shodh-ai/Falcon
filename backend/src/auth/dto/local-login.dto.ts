import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LocalLoginDto {
  /** Current clients may send `identifier`; `email` remains for compatibility. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  identifier?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

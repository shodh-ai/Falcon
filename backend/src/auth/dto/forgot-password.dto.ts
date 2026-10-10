import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  identifier?: string;

  /** Backwards-compatible email payload used by older clients. */
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ResetPasswordWithTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

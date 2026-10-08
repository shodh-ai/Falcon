import { IsString, IsOptional, IsNumber, Matches } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  @IsOptional()
  file_path?: string;

  @IsString()
  @IsOptional()
  file_name?: string;

  @IsNumber()
  @IsOptional()
  file_size?: number;

  @IsString()
  @IsOptional()
  file_type?: string;

  @IsString()
  @IsOptional()
  text_input?: string;

  @IsString()
  @IsOptional()
  evidence_type?: string;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  @IsOptional()
  content_hash?: string;
}

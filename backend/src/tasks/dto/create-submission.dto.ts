import { IsString, IsOptional, IsNumber } from 'class-validator';

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
}

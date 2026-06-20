import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitRndApplicationDto {
  @IsUUID()
  config_id!: string;

  @IsString()
  @MinLength(3)
  project_title!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  requested_budget?: number;

  @IsOptional()
  @IsObject()
  documents?: Record<string, string>;
}

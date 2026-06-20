import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertCertEventDto {
  @IsString()
  @MinLength(3)
  event_name!: string;

  @IsDateString()
  application_start_date!: string;

  @IsDateString()
  application_end_date!: string;

  @IsNumber()
  @Min(0)
  base_fee!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertMasterCalendarDto {
  @IsDateString()
  date: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_blocked_for_events?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  academic_year?: string;
}

export class BulkMasterCalendarDto {
  @IsString()
  @MaxLength(12)
  academic_year: string;

  entries: UpsertMasterCalendarDto[];
}

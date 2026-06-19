import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResultSessionDto {
  @IsUUID()
  course_id: string;

  @IsString()
  exam_type: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  semester?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_marks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pass_marks?: number;

  @IsOptional()
  @IsInt()
  grading_policy_id?: number;
}

export class OpenResultEntryDto {
  @IsOptional()
  @IsDateString()
  entry_open_at?: string;

  @IsOptional()
  @IsDateString()
  entry_close_at?: string;
}

export class ReopenResultEntryDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ConfigureSessionRulesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  pass_marks?: number;

  @IsOptional()
  @IsInt()
  grading_policy_id?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_marks?: number;
}

export class DeclareResultSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declaration_note?: string;
}

export class ProcessResultSessionDto {
  @IsOptional()
  @IsIn(['preview', 'commit'])
  mode?: 'preview' | 'commit';
}

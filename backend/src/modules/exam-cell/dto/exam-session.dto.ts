import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const EXAM_SESSION_CYCLES = [
  'ODD_SEMESTER',
  'EVEN_SEMESTER',
  'MID_SEMESTER',
  'END_SEMESTER',
  'SUPPLEMENTARY',
  'IMPROVEMENT',
  'BACK_PAPER',
  'PRACTICAL',
  'VIVA',
] as const;

export type ExamSessionCycle = (typeof EXAM_SESSION_CYCLES)[number];

export const EXAM_SESSION_STATUSES = [
  'DRAFT',
  'OPEN',
  'ACTIVE',
  'CLOSED',
  'ARCHIVED',
] as const;

export type ExamSessionStatus = (typeof EXAM_SESSION_STATUSES)[number];

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalText(value: unknown): unknown {
  const trimmed = trimText(value);
  return trimmed === '' ? undefined : trimmed;
}

export class CreateExamSessionDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  academic_year: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  session_name: string;

  @IsIn(EXAM_SESSION_CYCLES)
  cycle_type: ExamSessionCycle;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  semester?: number;

  @Transform(({ value }: { value: unknown }) => optionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  program_label?: string;

  @Transform(({ value }: { value: unknown }) => optionalText(value))
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start_date must use YYYY-MM-DD' })
  @IsDateString({ strict: true })
  start_date?: string;

  @Transform(({ value }: { value: unknown }) => optionalText(value))
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end_date must use YYYY-MM-DD' })
  @IsDateString({ strict: true })
  end_date?: string;

  @IsOptional()
  @IsIn(['DRAFT'])
  status?: 'DRAFT';
}

export class UpdateExamSessionStatusDto {
  @IsIn(EXAM_SESSION_STATUSES)
  status: ExamSessionStatus;
}

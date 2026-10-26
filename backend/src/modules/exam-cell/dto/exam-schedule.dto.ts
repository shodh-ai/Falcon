import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ExamType } from '../../../entities/exam-schedule.entity';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateExamScheduleDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsUUID()
  session_id: string;

  @IsIn(['MID_TERM', 'END_TERM', 'PRACTICAL'])
  exam_type: ExamType;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  subject_id: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'exam_date must use YYYY-MM-DD',
  })
  @IsDateString({ strict: true })
  exam_date: string;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'start_time must use HH:mm or HH:mm:ss',
  })
  start_time: string;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'end_time must use HH:mm or HH:mm:ss',
  })
  end_time: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  venue: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  max_marks?: number;

  @Transform(({ value }: { value: unknown }) => {
    const text = trimText(value);
    return text === '' ? undefined : text;
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  batch_label?: string;
}

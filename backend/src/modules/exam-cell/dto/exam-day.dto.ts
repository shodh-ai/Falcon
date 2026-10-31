import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export const EXAM_DAY_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'MEDICAL',
  'DEBARRED',
  'LATE',
] as const;

export class MarkExamDayAttendanceDto {
  @IsUUID()
  exam_schedule_id: string;

  @IsUUID()
  student_user_id: string;

  @IsIn(EXAM_DAY_ATTENDANCE_STATUSES)
  status: string;
}

export const ANSWER_SHEET_STATUSES = [
  'ISSUED',
  'COLLECTED',
  'PACKED',
  'DISPATCHED',
  'EVALUATOR_ASSIGNED',
  'CHECKED',
  'RETURNED',
  'ARCHIVED',
] as const;

export class ExamDayDateQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class CreateAnswerSheetDto {
  @IsUUID()
  exam_schedule_id: string;

  @IsUUID()
  student_user_id: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 40)
  sheet_number: string;

  @IsOptional()
  @IsBoolean()
  collect?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  resolution_reason?: string;
}

export class UpdateAnswerSheetStatusDto {
  @IsIn(ANSWER_SHEET_STATUSES)
  status: string;

  @IsOptional()
  @IsUUID()
  evaluator_user_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  reason?: string;
}

export class ReportMissingScriptDto {
  @IsUUID()
  exam_schedule_id: string;

  @IsUUID()
  student_user_id: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  reason: string;
}

export class ResolveMissingScriptDto {
  @IsIn(['FOUND', 'REPORTED_IN_ERROR'])
  resolution: 'FOUND' | 'REPORTED_IN_ERROR';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  reason: string;
}

export class CorrectScriptReceiptDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  reason: string;
}

export class ReportExamDayUfmDto {
  @IsUUID()
  exam_schedule_id: string;

  @IsUUID()
  student_user_id: string;

  @IsUUID()
  request_id: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  description: string;
}

export class ReviewExamDayUfmDto {
  @IsIn(['UNDER_REVIEW', 'CLOSED'])
  status: 'UNDER_REVIEW' | 'CLOSED';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 2000)
  reason: string;
}

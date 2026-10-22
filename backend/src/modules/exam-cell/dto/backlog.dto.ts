import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class ConfigureBacklogOfferingDto {
  @IsUUID() course_id: string;
  @IsInt() @Min(1) @Max(2147483647) semester: number;
  @IsIn(['END_TERM', 'INTERNAL']) source_exam_type: string;
  @IsUUID() exam_session_id: string;
  @IsUUID() exam_schedule_id: string;
  @IsUUID() faculty_user_id: string;
  @IsString() @MaxLength(12) academic_year: string;
  @IsDateString() opens_at: string;
  @IsDateString() closes_at: string;
  @IsDateString() payment_due_date: string;
  @IsIn(['REQUIRED', 'NO_FEE']) fee_mode: 'REQUIRED' | 'NO_FEE';
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  fee_amount: number;
  @IsInt() @Min(1) @Max(2147483647) attempt_limit: number;
  @IsIn(['LATEST_ATTEMPT', 'BEST_ATTEMPT']) selection_policy:
    | 'LATEST_ATTEMPT'
    | 'BEST_ATTEMPT';
  @IsInt() @Min(1) @Max(2147483647) grading_policy_id: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999.99) max_marks: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999.99) pass_marks: number;
}
export class ApplyBacklogDto {
  @IsUUID() offering_id: string;
  @IsUUID() source_report_id: string;
}
export class ReviewBacklogDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsString() @MaxLength(1000) reason: string;
}
export class SaveBacklogMarksDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) marks_obtained: number;
}
export class BacklogOfferingStatusDto {
  @IsIn(['OPEN', 'CLOSED']) status: 'OPEN' | 'CLOSED';
}

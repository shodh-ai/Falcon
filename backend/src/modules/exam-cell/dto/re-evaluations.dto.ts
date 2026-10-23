import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class AssignReEvaluationDto {
  @IsUUID()
  faculty_user_id: string;
}

export class LinkReEvaluationExamResultDto {
  @IsUUID()
  exam_result_id: string;
}

export class SubmitReEvaluationReportDto {
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99, { message: 'Revised marks exceed the supported numeric storage range' })
  revised_marks: number;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  report_notes: string;
}

export class RejectReEvaluationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

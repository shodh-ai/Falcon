import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class AssignReEvaluationDto {
  @IsUUID()
  faculty_user_id: string;
}

export class SubmitReEvaluationReportDto {
  @IsNumber()
  @Min(0)
  revised_marks: number;

  @IsString()
  @MaxLength(2000)
  report_notes: string;
}

export class RejectReEvaluationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

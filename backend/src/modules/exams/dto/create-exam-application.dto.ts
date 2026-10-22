import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateExamApplicationDto {
  @IsInt()
  @Min(1)
  subject_id: number;

  @IsIn(['RE_EVALUATION', 'BACKLOG'])
  application_type: 'RE_EVALUATION' | 'BACKLOG';

  @IsOptional()
  @IsUUID()
  source_result_id?: string;

  @IsOptional()
  @IsUUID()
  source_session_id?: string | null;
}

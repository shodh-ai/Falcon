import { IsIn, IsInt, IsUUID, Min, ValidateIf } from 'class-validator';

export class CreateExamApplicationDto {
  @IsInt()
  @Min(1)
  subject_id: number;

  @IsIn(['RE_EVALUATION', 'BACKLOG'])
  application_type: 'RE_EVALUATION' | 'BACKLOG';

  @ValidateIf((dto: CreateExamApplicationDto) => dto.application_type === 'RE_EVALUATION' || dto.exam_result_id != null)
  @IsUUID()
  exam_result_id?: string;
}

import { IsIn, IsInt } from 'class-validator';

export class CreateExamApplicationDto {
  @IsInt()
  subject_id: number;

  @IsIn(['RE_EVALUATION', 'BACKLOG'])
  application_type: 'RE_EVALUATION' | 'BACKLOG';
}

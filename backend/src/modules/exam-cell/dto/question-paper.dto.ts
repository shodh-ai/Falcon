import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const QUESTION_PAPER_STATUSES = [
  'UPLOADED',
  'UNDER_MODERATION',
  'COE_APPROVED',
  'PRINT_AUTHORIZED',
  'REJECTED',
] as const;

export class CreateQuestionPaperDto {
  @IsUUID()
  exam_schedule_id: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  subject_id?: number;

  @IsOptional()
  @IsUUID()
  setter_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateQuestionPaperStatusDto {
  @IsIn(['UNDER_MODERATION', 'COE_APPROVED', 'PRINT_AUTHORIZED', 'REJECTED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class UploadQuestionPaperDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

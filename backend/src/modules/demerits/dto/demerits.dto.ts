import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEMERIT_CATEGORIES = [
  'PLAGIARISM',
  'BEHAVIORAL',
  'ATTENDANCE',
  'EXAM_MALPRACTICE',
] as const;

export type DemeritCategory = (typeof DEMERIT_CATEGORIES)[number];

export const DEMERIT_REVIEW_STATUSES = ['APPROVED_BY_DC', 'REJECTED_BY_DC'] as const;

export class SubmitDemeritIncidentDto {
  /** Student user UUID, enrollment number, or email */
  @IsString()
  student_id: string;

  /** Course UUID or course code (subject scope) */
  @IsString()
  subject_id: string;

  @IsIn(DEMERIT_CATEGORIES)
  category: DemeritCategory;

  @IsInt()
  @Min(1)
  @Max(6)
  points: number;

  @IsString()
  @MaxLength(4000)
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence_urls?: string[];
}

export class ReviewDemeritIncidentDto {
  @IsIn(DEMERIT_REVIEW_STATUSES)
  status: 'APPROVED_BY_DC' | 'REJECTED_BY_DC';

  @IsString()
  @MaxLength(2000)
  dc_committee_remarks: string;
}

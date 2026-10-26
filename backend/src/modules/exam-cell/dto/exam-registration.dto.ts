import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExamFormWindowDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsUUID()
  session_id: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  semester: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  program_label: string;

  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'opens_at must include a UTC Z or numeric timezone offset',
  })
  opens_at: string;

  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'closes_at must include a UTC Z or numeric timezone offset',
  })
  closes_at: string;
}

export class UpdateExamFormWindowStatusDto {
  @IsIn(['DRAFT', 'OPEN', 'CLOSED'])
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
}

export class SyncExamRegistrationsDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  semester: number;
}

export class ReviewExamRegistrationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}

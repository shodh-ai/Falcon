import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StudentAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  permanent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  current?: string;
}

export class UpdateStudentProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profile_photo_url?: string;

  @IsOptional()
  @IsObject()
  bank_details?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  parent_details?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => StudentAddressDto)
  address?: StudentAddressDto;
}

export class UploadAdmissionDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;
}

export class LogExtracurricularDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  activity_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  event_date?: string;
}

export class CreateStudentPayOrderDto {
  @IsUUID()
  demand_id: string;
}

export class ConfirmStudentPaymentDto {
  @IsUUID()
  demand_id: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  payment_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  signature?: string;
}

export class ProfileUpdateRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  fields_requested?: string[];
}

export class AlumniRegisterDto {
  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.length > 0)
  @IsUrl(
    { require_protocol: true },
    { message: 'linkedin_url must be a valid URL' },
  )
  @MaxLength(500)
  linkedin_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placement_organization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  higher_education_plans?: string;
}

export class AcknowledgePolicyDto {
  @IsOptional()
  @IsIn(['YES', 'NO'])
  vote?: 'YES' | 'NO';
}

export class AcademicCalendarQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

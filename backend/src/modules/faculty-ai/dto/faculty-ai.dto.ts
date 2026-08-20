import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FacultyAiAttachmentDto {
  @IsString()
  @MaxLength(260)
  name!: string;

  @IsString()
  @MaxLength(120)
  mime!: string;

  @IsOptional()
  size?: number;

  /** Plain-text extract or pasted content (max handled in service). */
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  text?: string;
}

export class CreateFacultyAiConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  prompt_type?: string;
}

export class RenameFacultyAiConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class SendFacultyAiMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16_000)
  content!: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  prompt_type?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacultyAiAttachmentDto)
  attachments?: FacultyAiAttachmentDto[];

  /** When true, replace the last assistant message instead of appending a new pair. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  regenerate?: boolean;
}

export const FACULTY_AI_ROLES = [
  'Faculty',
  'HOD',
  'Dean',
  'SuperAdmin',
  'Admin',
] as const;

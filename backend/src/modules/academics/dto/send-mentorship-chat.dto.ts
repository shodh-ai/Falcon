import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMentorshipChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  /** Required when faculty sends to a specific mentee. */
  @IsOptional()
  @IsUUID()
  student_user_id?: string;
}

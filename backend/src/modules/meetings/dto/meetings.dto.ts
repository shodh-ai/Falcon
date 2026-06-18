import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ScheduleMeetingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  venue: string;

  @IsDateString()
  meeting_at: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  invitee_user_ids: string[];
}

export class RequestMeetingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  venue: string;

  @IsDateString()
  meeting_at: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsUUID()
  recipient_user_id: string;
}

export class RespondMeetingDto {
  @IsIn(['ACCEPTED', 'DECLINED'])
  response: 'ACCEPTED' | 'DECLINED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateMeetingAgendaDto {
  @IsString()
  @MinLength(1)
  agenda: string;
}

export class PublishMeetingMinutesDto {
  @IsString()
  @MinLength(1)
  notes: string;

  @IsOptional()
  @IsString()
  decisions?: string;

  @IsOptional()
  @IsString()
  action_items?: string;
}

import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class BookWorkspaceDto {
  @IsUUID()
  workspace_id!: string;

  @IsISO8601()
  start_time!: string;

  @IsISO8601()
  end_time!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  purpose?: string;
}

export class RequestMentorMeetingDto {
  @IsUUID()
  mentor_user_id!: string;

  @IsString()
  @MaxLength(255)
  topic!: string;

  @IsISO8601()
  requested_time!: string;
}

export class RespondMentorMeetingDto {
  @IsString()
  meeting_link?: string;

  @IsOptional()
  @IsString()
  decline_reason?: string;
}

export class MentorFeedbackDto {
  @IsString()
  @MaxLength(2000)
  mentor_feedback!: string;
}

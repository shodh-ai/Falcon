import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class ApplyToJobDto {
  @IsUUID()
  student_user_id: string;

  @IsOptional()
  @IsObject()
  responses?: Record<string, unknown>;
}

import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class LeaveActionDto {
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  comment?: string;

  @IsUUID()
  actor_user_id: string;
}

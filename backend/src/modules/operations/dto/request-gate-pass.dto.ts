import { IsDateString, IsString, IsUUID } from 'class-validator';

export class RequestGatePassDto {
  @IsUUID()
  student_user_id: string;

  @IsString()
  reason: string;

  @IsDateString()
  expected_exit_at: string;

  @IsDateString()
  expected_return_at: string;
}

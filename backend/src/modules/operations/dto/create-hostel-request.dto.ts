import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { HostelRequestType } from '../../../entities/hostel-request.entity';

export class CreateHostelRequestDto {
  @IsIn(['GATE_PASS', 'ROOM_CHANGE', 'MESS_CHANGE', 'MAINTENANCE'])
  request_type: HostelRequestType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

import { IsUUID } from 'class-validator';

export class ApplyCertEventDto {
  @IsUUID()
  event_id!: string;
}

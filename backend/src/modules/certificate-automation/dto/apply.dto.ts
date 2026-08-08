import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyCertEventDto {
  @IsString()
  @IsNotEmpty()
  event_id!: string;
}

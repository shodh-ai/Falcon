import { IsUUID } from 'class-validator';

export class GrantEntityAccessDto {
  @IsUUID()
  user_id: string;
}

import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ConfirmEventRegistrationDto {
  @IsUUID()
  registration_id: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  payment_ref: string;
}

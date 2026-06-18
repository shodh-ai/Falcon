import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  device_token: string;
}

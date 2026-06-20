import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveVenueBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

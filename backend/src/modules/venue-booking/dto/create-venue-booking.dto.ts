import { IsISO8601, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateVenueBookingDto {
  @IsUUID()
  venue_id!: string;

  @IsISO8601()
  start_time!: string;

  @IsISO8601()
  end_time!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  purpose!: string;
}

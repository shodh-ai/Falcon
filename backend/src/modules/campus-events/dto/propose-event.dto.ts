import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ProposeEventDto {
  @IsUUID()
  club_id: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  venue?: string;

  @IsOptional()
  @IsUUID()
  venue_id?: string;

  @IsOptional()
  @IsString()
  guest_speakers?: string;

  @IsDateString()
  event_date: string;

  @IsInt()
  @Min(1)
  total_slots: number;

  @IsBoolean()
  is_paid: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ticket_price?: number;
}

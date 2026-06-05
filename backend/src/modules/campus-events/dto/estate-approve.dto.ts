import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EstateApproveDto {
  @IsOptional()
  @IsUUID()
  venue_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  estate_notes?: string;
}

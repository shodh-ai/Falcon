import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitEcellProjectDto {
  @IsString()
  @MaxLength(255)
  startup_name!: string;

  @IsString()
  innovation_description!: string;

  @IsOptional()
  @IsString()
  pitch_deck_url?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  requested_funding!: number;
}

import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class FundTransferDto {
  @IsNumber()
  @Min(0.01)
  transfer_amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ledger_code?: string;

  @IsString()
  @MaxLength(120)
  transfer_ref: string;
}

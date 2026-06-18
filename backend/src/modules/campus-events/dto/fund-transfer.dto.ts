import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class FundTransferDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  transfer_amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  transfer_ref: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ledger_code?: string;
}

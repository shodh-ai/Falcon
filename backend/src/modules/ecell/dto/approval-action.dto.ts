import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EcellApprovalActionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  approved_funding_amount?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class EcellRejectDto {
  @IsString()
  remarks!: string;
}

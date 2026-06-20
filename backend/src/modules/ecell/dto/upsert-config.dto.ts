import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertEcellConfigDto {
  @IsString()
  @MaxLength(100)
  cohort_name!: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_funding_limit?: number;

  @IsString()
  @MaxLength(50)
  level_1_approver_role!: string;

  @IsString()
  @MaxLength(50)
  level_2_approver_role!: string;
}

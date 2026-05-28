import { IsDateString, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGradingPolicyDto {
  @IsString()
  @MaxLength(120)
  policy_name: string;

  @IsOptional()
  @IsInt()
  program_id?: number;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsObject()
  rules: Record<string, unknown>;
}

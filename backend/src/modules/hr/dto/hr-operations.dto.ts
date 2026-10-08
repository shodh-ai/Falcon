import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsNumber()
  role_id?: number;

  @IsOptional()
  @IsNumber()
  dept_id?: number;

  @IsOptional()
  @IsString()
  salary_base?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  reporting_officer_id?: string | null;
}

export class RunPayrollDto {
  @IsString()
  month: string; // YYYY-MM
}

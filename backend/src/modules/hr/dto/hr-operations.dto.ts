import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsOptional()
  @IsUUID()
  reporting_officer_id?: string | null;
}

export class RunPayrollDto {
  @IsString()
  month: string; // YYYY-MM
}

import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
  IsArray,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  task_name: string;

  @IsNumber()
  role_id: number;

  @IsString()
  month: string;

  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean;

  @IsString()
  @IsOptional()
  task_description?: string;

  @IsUUID()
  @IsOptional()
  tenant_id?: string;

  @IsNumber()
  @IsOptional()
  dept_id?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  @IsOptional()
  academic_year?: string;

  @IsString()
  @IsOptional()
  due_date_policy?: 'MONTH_END' | 'DAY_25';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence_requirements?: string[];

  @IsString()
  @IsOptional()
  source_module?: string;

  @IsString()
  @IsOptional()
  owner_label?: string;

  @IsUUID()
  @IsOptional()
  default_assignee_id?: string;

  @IsString()
  @IsOptional()
  source_reference?: string;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  @IsOptional()
  source_hash?: string;
}

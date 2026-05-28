import { IsString, IsBoolean, IsOptional, IsNumber } from 'class-validator';

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
}

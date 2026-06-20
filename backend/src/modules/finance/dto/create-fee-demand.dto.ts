import {
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFeeDemandDto {
  @IsUUID()
  student_user_id: string;

  @IsString()
  @MaxLength(40)
  fee_head: string;

  @IsString()
  @MaxLength(12)
  academic_year: string;

  @IsOptional()
  @IsInt()
  semester?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_amount: number;

  @IsDateString()
  due_date: string;

  @IsOptional()
  @IsObject()
  fee_breakup?: Record<string, unknown>;
}

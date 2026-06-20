import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpsertRndConfigDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_rules?: string[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

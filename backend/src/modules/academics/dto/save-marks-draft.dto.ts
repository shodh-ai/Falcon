import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveMarksDraftEntryDto {
  @IsUUID()
  student_user_id: string;

  @IsNumber()
  @Min(0)
  marks_obtained: number;

  @IsOptional()
  @IsString()
  co_mapped?: string;
}

export class SaveMarksDraftDto {
  @IsUUID()
  course_id: string;

  @IsString()
  @IsNotEmpty()
  exam_type: string;

  @IsOptional()
  @IsString()
  examType?: string;

  @IsNumber()
  @Min(1)
  max_marks: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveMarksDraftEntryDto)
  entries: SaveMarksDraftEntryDto[];
}

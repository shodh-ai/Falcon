import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class BulkAttendanceEntryDto {
  @IsUUID()
  student_id: string;

  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

export class BulkAttendanceDto {
  @IsInt()
  course_offering_id: number;

  @IsInt()
  subject_id: number;

  @IsOptional()
  @IsInt()
  batch_id?: number;

  @IsDateString()
  session_date: string;

  @IsOptional()
  @IsString()
  session_slot?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceEntryDto)
  entries: BulkAttendanceEntryDto[];
}

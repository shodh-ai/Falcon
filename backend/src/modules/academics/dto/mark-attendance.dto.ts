import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class AttendanceEntryDto {
  @IsUUID()
  student_user_id: string;

  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

export class MarkAttendanceDto {
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
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

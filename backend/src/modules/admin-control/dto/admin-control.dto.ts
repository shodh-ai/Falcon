import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  role_name!: string;

  @IsOptional()
  @IsInt()
  dept_id?: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporary_password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role_name?: string;

  @IsOptional()
  @IsInt()
  dept_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  temporary_password?: string;
}

export class RolePermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  view?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  edit?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approve?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  create?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  read?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  update?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  delete?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  export?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  import?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assign?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manage?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audit?: string[];
}

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  dept_name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsInt()
  school_id!: number;

  @IsOptional()
  @IsUUID()
  hod_user_id?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  dept_name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  school_id?: number | null;

  @IsOptional()
  @IsUUID()
  hod_user_id?: string | null;
}

export class CreateCourseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  course_code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  course_name!: string;

  @IsInt()
  @Min(0)
  credits!: number;

  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;

  @IsOptional()
  @IsInt()
  entity_id?: number;

  @IsOptional()
  @IsInt()
  min_attendance?: number;

  @IsOptional()
  @IsUUID()
  faculty_user_id?: string;

  @IsOptional()
  @IsInt()
  semester?: number;

  @IsOptional()
  @IsInt()
  dept_id?: number;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  course_code?: string;

  @IsOptional()
  @IsString()
  course_name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;

  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;

  @IsOptional()
  @IsInt()
  entity_id?: number | null;

  @IsOptional()
  @IsInt()
  min_attendance?: number | null;

  @IsOptional()
  @IsUUID()
  faculty_user_id?: string | null;

  @IsOptional()
  @IsInt()
  semester?: number | null;
}

export class BroadcastNotificationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  message!: string;

  @IsIn([
    'everyone',
    'students',
    'faculty',
    'hod',
    'registrar',
    'finance',
    'library',
    'placement',
    'hostel',
    'department',
    'user',
  ])
  audience!: string;

  @IsOptional()
  @IsInt()
  dept_id?: number;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  action_link?: string;

  @IsOptional()
  @IsIn(['info', 'success', 'warning', 'critical'])
  severity?: 'info' | 'success' | 'warning' | 'critical';
}

export class CalendarEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @IsIn([
    'SEMESTER',
    'HOLIDAY',
    'EXAM',
    'ADMISSIONS',
    'FEE_DEADLINE',
    'UNIVERSITY_EVENT',
  ])
  event_type!: string;

  @IsString()
  starts_on!: string;

  @IsOptional()
  @IsString()
  ends_on?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;
}

export class AiAssistDto {
  @IsString()
  @MinLength(3)
  prompt!: string;

  @IsOptional()
  @IsIn([
    'generate_report',
    'analyze_usage',
    'detect_inactive',
    'generate_announcement',
    'summarize_logs',
    'security_risks',
    'suggest_improvements',
    'crm_qa',
  ])
  intent?: string;
}

export class SystemSettingsDto {
  @IsOptional()
  @IsString()
  university_name?: string;

  @IsOptional()
  @IsString()
  university_code?: string;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  email_config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sms_config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  password_policy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  security_settings?: Record<string, unknown>;
}

export class BulkImportUsersDto {
  @ValidateNested({ each: true })
  @Type(() => CreateAdminUserDto)
  @IsArray()
  rows!: CreateAdminUserDto[];
}

export class NamedEntityDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  school_id?: number;

  @IsOptional()
  @IsInt()
  dept_id?: number;

  @IsOptional()
  @IsInt()
  credits?: number;

  @IsOptional()
  @IsString()
  extra?: string;
}

export class AnnouncementDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  body!: string;

  @IsIn([
    'HOLIDAY',
    'EXAM',
    'PLACEMENT',
    'MAINTENANCE',
    'EMERGENCY',
    'CIRCULAR',
  ])
  category!: string;

  @IsIn(['everyone', 'students', 'faculty', 'hod', 'registrar', 'department'])
  audience!: string;
}

export class FeeStructureDto {
  @IsString()
  fee_type!: string;

  @IsOptional()
  @IsString()
  academic_year?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  due_on?: string;
}

export class PortalAccessDto {
  @IsString()
  portal_key!: string;

  @IsBoolean()
  is_enabled!: boolean;
}

export class PromoteStudentDto {
  @IsUUID()
  student_user_id!: string;

  @IsOptional()
  @IsInt()
  to_semester?: number;

  @IsOptional()
  @IsString()
  to_batch?: string;
}

export class AssignHodDto {
  @Type(() => Number)
  @IsInt()
  dept_id!: number;

  @IsUUID()
  hod_user_id!: string;
}

export class ReportExportDto {
  @IsIn([
    'attendance',
    'admissions',
    'fees',
    'faculty',
    'students',
    'results',
    'placements',
    'library',
    'hostel',
    'department',
    'course',
  ])
  report!: string;

  @IsIn(['pdf', 'excel', 'csv'])
  format!: 'pdf' | 'excel' | 'csv';
}

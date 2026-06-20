import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import type { AlumniServiceType } from '../../../entities/alumni-service-request.entity';

export class CreateAlumniRequestDto {
  @IsUUID()
  alumni_user_id: string;

  @IsIn([
    'TRANSCRIPT',
    'DEGREE_DISPATCH',
    'MIGRATION_CERTIFICATE',
    'BONAFIDE',
    'OTHER',
  ])
  service_type: AlumniServiceType;

  @IsOptional()
  @IsObject()
  dispatch_details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  remarks?: string;
}

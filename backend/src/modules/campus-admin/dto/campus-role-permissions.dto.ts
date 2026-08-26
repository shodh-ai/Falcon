import { IsArray, IsOptional, IsString } from 'class-validator';

/** Capability arrays Campus Admin may update for assignable campus roles. */
export class UpdateCampusRolePermissionsDto {
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

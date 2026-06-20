import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTransportRouteDto {
  @IsString()
  @MaxLength(30)
  route_code: string;

  @IsString()
  @MaxLength(150)
  route_name: string;

  @IsOptional()
  @IsObject()
  stops?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  bus_number?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annual_fee?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

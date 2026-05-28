import { IsString, IsOptional } from 'class-validator';

export class CreateHandoverDto {
  @IsString()
  from_user: string;

  @IsString()
  to_user: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

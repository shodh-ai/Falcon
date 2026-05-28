import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLibraryBookDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  publisher?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  total_copies?: number;

  @IsOptional()
  @IsString()
  shelf_location?: string;
}
